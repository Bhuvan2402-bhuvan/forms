const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Zero-dependency .env loader
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=');
        if (key && vals.length > 0) {
          const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
}
loadEnv();

// --- Configuration ---
const APP_URL = process.env.APP_URL || process.env.CANONICAL_ORIGIN || '';
const DATABASE_URL = process.env.DATABASE_URL || '';
const PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST || '';
const PGPORT = parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10);
const PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || '';
const PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
const PGDATABASE = process.env.PGDATABASE || process.env.POSTGRES_DB || '';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'formcraft_production_secret_key_2026_default';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ENCRYPTION_KEY_RAW = process.env.ENCRYPTION_KEY || '';
const DEFAULT_PORT = parseInt(process.env.PORT || '3005', 10);
const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5 MB

let REQUIRE_POSTGRES = process.env.REQUIRE_POSTGRES === 'true' || (process.env.NODE_ENV === 'production' && process.env.ALLOW_JSON_FALLBACK !== 'true' && !!(DATABASE_URL || PGHOST));

function setRequirePostgres(val) {
  REQUIRE_POSTGRES = !!val;
}

const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
});

const FORMS_FILE = path.join(DATA_DIR, 'forms.json');
const SUBS_FILE = path.join(DATA_DIR, 'submissions.json');
const CRED_FILE = path.join(DATA_DIR, 'admin_credential.json');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit.log');

// --- AES-256-GCM Field-Level Authenticated Encryption ---
function getEncryptionKey() {
  if (ENCRYPTION_KEY_RAW && ENCRYPTION_KEY_RAW.length >= 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY_RAW).digest();
  }
  return crypto.pbkdf2Sync(ADMIN_SECRET, 'formcraft_field_enc_salt_v1', 100000, 32, 'sha256');
}
const MASTER_ENC_KEY = getEncryptionKey();

function encryptField(text) {
  if (text === null || text === undefined || text === '') return text;
  const strVal = typeof text === 'object' ? JSON.stringify(text) : String(text);
  const iv = crypto.randomBytes(12); // 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_ENC_KEY, iv);
  let encrypted = cipher.update(strVal, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag().toString('base64');
  return `enc:v1:${iv.toString('base64')}:${tag}:${encrypted}`;
}

function decryptField(cipherText) {
  if (typeof cipherText !== 'string' || !cipherText.startsWith('enc:v1:')) {
    return cipherText;
  }
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 5) return cipherText;
    const [, version, ivBase64, tagBase64, dataBase64] = parts;
    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_ENC_KEY, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(dataBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted;
    }
  } catch (err) {
    console.warn('Field decryption failed or corrupted data:', err.message);
    return '[Encrypted Data - Decryption Failed]';
  }
}

function encryptSubmissionPayload(dataObj) {
  if (!dataObj || typeof dataObj !== 'object') return dataObj;
  const encrypted = {};
  for (const [k, v] of Object.entries(dataObj)) {
    encrypted[k] = encryptField(v);
  }
  return encrypted;
}

function decryptSubmissionPayload(dataObj) {
  if (!dataObj || typeof dataObj !== 'object') return dataObj;
  const decrypted = {};
  for (const [k, v] of Object.entries(dataObj)) {
    decrypted[k] = decryptField(v);
  }
  return decrypted;
}

// --- Audit Logger ---
function logAuditEvent(event, details = {}, ip = 'internal') {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ip: ip.replace(/^::ffff:/, ''),
    details
  };
  const logLine = JSON.stringify(entry) + '\n';
  fs.appendFile(AUDIT_LOG_FILE, logLine, () => {});
}

// --- Sliding-Window Rate Limiter ---
const rateLimitBuckets = new Map();
function checkRateLimit(ip, endpointType, limit = 60, windowMs = 60000) {
  const key = `${ip}:${endpointType}`;
  const now = Date.now();
  const record = rateLimitBuckets.get(key) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }

  rateLimitBuckets.set(key, record);
  return record.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitBuckets.entries()) {
    if (now > v.resetTime) rateLimitBuckets.delete(k);
  }
}, 300000);

// --- PostgreSQL Pool Setup ---
let pgPool = null;
let pgAvailable = false;

try {
  const { Pool } = require('pg');
  const poolConfig = DATABASE_URL
    ? { connectionString: DATABASE_URL, max: 10, idleTimeoutMillis: 30000 }
    : (PGHOST
        ? { host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: PGDATABASE, max: 10, idleTimeoutMillis: 30000 }
        : null);

  if (poolConfig) {
    pgPool = new Pool(poolConfig);
    pgPool.on('error', (err) => {
      console.warn('PostgreSQL pool background error:', err.message);
      pgAvailable = false;
    });
  }
} catch (err) {
  console.log('Running in local JSON storage mode:', err.message);
}

// Initialize PostgreSQL Tables
async function initPgDatabase() {
  if (!pgPool) return false;
  try {
    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS forms (
            id VARCHAR(128) PRIMARY KEY,
            title VARCHAR(512) NOT NULL,
            description TEXT DEFAULT '',
            category VARCHAR(128) DEFAULT 'Custom',
            badge VARCHAR(128) DEFAULT 'Single Page Form',
            is_multi_step BOOLEAN DEFAULT FALSE,
            theme JSONB DEFAULT '{"accentColor": "#6366f1", "borderRadius": "16px", "fontFamily": "\x27Plus Jakarta Sans\x27, sans-serif"}'::jsonb,
            settings JSONB DEFAULT '{"acceptingResponses": true, "hasEndTime": false, "endDateTime": null, "closedMessage": "This form is no longer accepting responses. The deadline for submission has passed."}'::jsonb,
            steps JSONB DEFAULT '[]'::jsonb,
            fields JSONB DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms(updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forms_category ON forms(category);
        
        CREATE TABLE IF NOT EXISTS submissions (
            id VARCHAR(128) PRIMARY KEY,
            form_id VARCHAR(128) NOT NULL,
            submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
            duration_seconds INTEGER DEFAULT 60,
            data JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON submissions(form_id);
        CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

        CREATE TABLE IF NOT EXISTS admin_auth (
            id VARCHAR(64) PRIMARY KEY DEFAULT 'admin_credential',
            password_hash VARCHAR(512) NOT NULL,
            salt VARCHAR(128) NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
        );
      `);
      pgAvailable = true;
      console.log('Self-hosted PostgreSQL database verified & ready.');
      return true;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('PostgreSQL initialization skipped / database offline:', err.message);
    pgAvailable = false;
    return false;
  }
}

initPgDatabase().catch(() => {});

// --- Local Filesystem Storage Fallback ---
function getLocalForms() {
  try {
    if (fs.existsSync(FORMS_FILE)) {
      const raw = fs.readFileSync(FORMS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalForms(forms) {
  try {
    fs.writeFileSync(FORMS_FILE, JSON.stringify(forms, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local forms file:', err);
  }
}

function getLocalSubmissions() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const raw = fs.readFileSync(SUBS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveLocalSubmissions(subs) {
  try {
    fs.writeFileSync(SUBS_FILE, JSON.stringify(subs, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write local submissions file:', err);
  }
}

// --- Cryptographic Password & Session Helpers ---
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, salt, hash) {
  const testHash = hashPassword(password, salt);
  const bufA = Buffer.from(testHash, 'hex');
  const bufB = Buffer.from(hash, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function createSessionToken() {
  const payload = {
    role: 'admin',
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000
  };
  const str = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(str).digest('base64url');
  return `${str}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [str, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', ADMIN_SECRET).update(str).digest('base64url');
  const bufA = Buffer.from(sig);
  const bufB = Buffer.from(expectedSig);
  if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return false;
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

function getCanonicalOrigin(req) {
  if (APP_URL) {
    return APP_URL.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] || (req.connection.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${DEFAULT_PORT}`;
  return `${proto}://${host}`;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff'
};

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_SIZE) {
        reject(new Error('Payload Too Large'));
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// --- HTTP Server Core ---
const server = http.createServer(async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1';
  const origin = getCanonicalOrigin(req);
  const parsedUrl = new URL(req.url, origin);
  const pathname = parsedUrl.pathname;

  // --- Strict Security Headers ---
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; img-src 'self' data: blob: https:; connect-src 'self' " + (APP_URL || '') + "; frame-ancestors 'self';");

  const isHttps = origin.startsWith('https://') || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  // Database engine indicator header
  res.setHeader('X-Database-Engine', pgAvailable ? 'postgresql' : 'local_json');

  // CORS Policy
  const reqOrigin = req.headers.origin;
  if (reqOrigin && (reqOrigin === origin || reqOrigin.startsWith('http://localhost') || reqOrigin.startsWith('http://127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Routes ---

  // 0. Server Config API
  if (pathname === '/api/config' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      canonicalOrigin: origin,
      environment: process.env.NODE_ENV || 'production',
      database: pgAvailable ? 'postgresql' : (REQUIRE_POSTGRES ? 'postgresql_offline' : 'local_json'),
      requirePostgres: REQUIRE_POSTGRES,
      encryption: 'AES-256-GCM',
      version: '1.0.0'
    }));
    return;
  }

  // 1. Health & Status
  if (pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json');
    const isHealthy = REQUIRE_POSTGRES ? pgAvailable : (pgAvailable || true);
    res.writeHead(isHealthy ? 200 : 503);
    res.end(JSON.stringify({
      connected: pgAvailable,
      databaseType: pgAvailable ? 'PostgreSQL (Self-Hosted Authoritative)' : (REQUIRE_POSTGRES ? 'PostgreSQL (Offline - Fallback Disabled)' : 'Local JSON Store'),
      tablesReady: pgAvailable,
      requirePostgres: REQUIRE_POSTGRES,
      canonicalOrigin: origin
    }));
    return;
  }

  // 2. Admin Authentication & Session Management
  if (pathname === '/api/admin-auth' || pathname.startsWith('/api/admin/')) {
    res.setHeader('Content-Type', 'application/json');

    if (!checkRateLimit(clientIp, 'auth', 10, 60000)) {
      logAuditEvent('RATE_LIMIT_EXCEEDED', { endpoint: 'admin-auth' }, clientIp);
      res.writeHead(429);
      res.end(JSON.stringify({ error: 'Too many login attempts. Please wait 1 minute.' }));
      return;
    }

    let payload;
    try {
      payload = await getRequestBody(req);
    } catch {
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'Payload too large' }));
      return;
    }

    const action = parsedUrl.searchParams.get('action') || payload.action || (pathname.endsWith('/login') ? 'login' : pathname.endsWith('/change-password') ? 'change-password' : 'verify');

    async function getStoredCredential() {
      if (pgPool && pgAvailable) {
        try {
          const r = await pgPool.query('SELECT password_hash, salt FROM admin_auth WHERE id = $1 LIMIT 1', ['admin_credential']);
          if (r.rows.length > 0 && r.rows[0].password_hash) return r.rows[0];
        } catch {}
      }

      if (fs.existsSync(CRED_FILE)) {
        try {
          const fileData = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
          if (fileData.password_hash && fileData.salt) return fileData;
        } catch {}
      }
      return null;
    }

    async function saveStoredCredential(passwordHash, salt) {
      const cred = { password_hash: passwordHash, salt, updated_at: new Date().toISOString() };
      if (pgPool) {
        try {
          await pgPool.query(`
            INSERT INTO admin_auth (id, password_hash, salt, updated_at)
            VALUES ('admin_credential', $1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET password_hash = $1, salt = $2, updated_at = CURRENT_TIMESTAMP
          `, [passwordHash, salt]);
          pgAvailable = true;
        } catch {}
      }
      try { fs.writeFileSync(CRED_FILE, JSON.stringify(cred, null, 2), 'utf8'); } catch {}
      return true;
    }

    // Verify
    if (action === 'verify') {
      const authHeader = req.headers.authorization || '';
      const token = payload.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);
      const isValid = verifySessionToken(token);
      res.writeHead(isValid ? 200 : 401);
      res.end(JSON.stringify({ authenticated: isValid, role: isValid ? 'admin' : null }));
      return;
    }

    // Login
    if (action === 'login' && req.method === 'POST') {
      const { password } = payload;
      if (!password || typeof password !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, error: 'Password is required' }));
        return;
      }

      const stored = await getStoredCredential();
      let isMatch = false;

      if (stored && stored.password_hash && stored.salt) {
        isMatch = verifyPassword(password, stored.salt, stored.password_hash);
      } else {
        isMatch = password === DEFAULT_PASSWORD;
      }

      if (isMatch) {
        const token = createSessionToken();
        logAuditEvent('LOGIN_SUCCESS', { role: 'admin' }, clientIp);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, token, role: 'admin' }));
        return;
      }

      logAuditEvent('LOGIN_FAILURE', { reason: 'invalid_password' }, clientIp);
      res.writeHead(401);
      res.end(JSON.stringify({ success: false, error: 'Invalid admin password' }));
      return;
    }

    // Change Password
    if (action === 'change-password' && req.method === 'POST') {
      const authHeader = req.headers.authorization || '';
      const token = payload.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

      if (!verifySessionToken(token)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized. Please log in first.' }));
        return;
      }

      const { currentPassword, newPassword } = payload;
      if (!currentPassword || !newPassword || newPassword.length < 8) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'New password must be at least 8 characters long.' }));
        return;
      }

      const stored = await getStoredCredential();
      let isCurrentMatch = false;

      if (stored && stored.password_hash && stored.salt) {
        isCurrentMatch = verifyPassword(currentPassword, stored.salt, stored.password_hash);
      } else {
        isCurrentMatch = currentPassword === DEFAULT_PASSWORD;
      }

      if (!isCurrentMatch) {
        logAuditEvent('PASSWORD_CHANGE_FAILED', { reason: 'wrong_current_password' }, clientIp);
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Incorrect current password' }));
        return;
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = hashPassword(newPassword, newSalt);
      await saveStoredCredential(newHash, newSalt);

      logAuditEvent('PASSWORD_CHANGED', {}, clientIp);
      const freshToken = createSessionToken();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, token: freshToken, message: 'Admin password updated successfully.' }));
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 3. Forms API (GET, POST, DELETE)
  if (pathname === '/api/forms') {
    res.setHeader('Content-Type', 'application/json');

    // --- GET Forms ---
    if (req.method === 'GET') {
      const id = parsedUrl.searchParams.get('id');

      // 3.1 Fetch Single Form
      if (id) {
        let form = null;

        if (pgPool && pgAvailable) {
          try {
            const r = await pgPool.query('SELECT * FROM forms WHERE id = $1 LIMIT 1', [id]);
            if (r.rows.length > 0) {
              const row = r.rows[0];
              form = {
                id: row.id,
                title: row.title,
                description: row.description || '',
                category: row.category || 'Custom',
                badge: row.badge || 'Single Page Form',
                isMultiStep: row.is_multi_step,
                theme: row.theme || {},
                settings: row.settings || {},
                steps: row.steps || [],
                fields: row.fields || [],
                updatedAt: row.updated_at
              };
            }
          } catch (err) {
            logAuditEvent('DATABASE_READ_ERROR', { operation: 'get_form', formId: id, error: err.message }, clientIp);
            if (REQUIRE_POSTGRES) {
              res.writeHead(503);
              res.end(JSON.stringify({ error: 'Authoritative database query failed.' }));
              return;
            }
          }
        } else if (REQUIRE_POSTGRES) {
          res.writeHead(503);
          res.end(JSON.stringify({ error: 'Authoritative database is offline. Fallback disabled.' }));
          return;
        }

        if (!form && !REQUIRE_POSTGRES) {
          const localForms = getLocalForms();
          form = localForms.find(f => f.id === id) || null;
        }

        if (form) {
          res.writeHead(200);
          res.end(JSON.stringify(form));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: 'Form not found', id }));
        }
        return;
      }

      // 3.2 Fetch All Forms
      let formsMap = new Map();

      if (pgPool && pgAvailable) {
        try {
          const r = await pgPool.query('SELECT * FROM forms ORDER BY updated_at DESC');
          r.rows.filter(row => !row.id.startsWith('__system_')).forEach(row => {
            formsMap.set(row.id, {
              id: row.id,
              title: row.title,
              description: row.description || '',
              category: row.category || 'Custom',
              badge: row.badge || 'Single Page Form',
              isMultiStep: row.is_multi_step,
              theme: row.theme || {},
              settings: row.settings || {},
              steps: row.steps || [],
              fields: row.fields || [],
              updatedAt: row.updated_at
            });
          });
        } catch (err) {
          logAuditEvent('DATABASE_READ_ERROR', { operation: 'get_forms_all', error: err.message }, clientIp);
          if (REQUIRE_POSTGRES) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Authoritative database query failed.' }));
            return;
          }
        }
      } else if (REQUIRE_POSTGRES) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'Authoritative database is offline. Fallback disabled.' }));
        return;
      }

      if (!REQUIRE_POSTGRES) {
        const localForms = getLocalForms();
        localForms.forEach(f => {
          if (!formsMap.has(f.id)) formsMap.set(f.id, f);
        });
      }

      const combined = Array.from(formsMap.values());
      if (combined.length > 0) saveLocalForms(combined);

      res.writeHead(200);
      res.end(JSON.stringify(combined));
      return;
    }

    // --- POST Form (Create / Update) ---
    if (req.method === 'POST') {
      if (!checkRateLimit(clientIp, 'form_create', 30, 60000)) {
        res.writeHead(429);
        res.end(JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }));
        return;
      }

      let payload;
      try {
        payload = await getRequestBody(req);
      } catch {
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }

      const formId = (payload.id && typeof payload.id === 'string')
        ? payload.id.replace(/[^a-zA-Z0-9_-]/g, '')
        : `form-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

      const title = (payload.title && typeof payload.title === 'string') ? payload.title.substring(0, 500) : 'Untitled Form';
      const description = typeof payload.description === 'string' ? payload.description.substring(0, 5000) : '';
      const category = typeof payload.category === 'string' ? payload.category.substring(0, 128) : 'Custom';
      const badge = typeof payload.badge === 'string' ? payload.badge.substring(0, 128) : 'Single Page Form';
      const isMultiStep = !!payload.isMultiStep;
      const theme = (payload.theme && typeof payload.theme === 'object') ? payload.theme : {};
      const settings = (payload.settings && typeof payload.settings === 'object') ? payload.settings : {
        acceptingResponses: true,
        hasEndTime: false,
        endDateTime: null,
        closedMessage: "This form is no longer accepting responses. The deadline for submission has passed."
      };
      const steps = Array.isArray(payload.steps) ? payload.steps.slice(0, 50) : [];
      const fields = Array.isArray(payload.fields) ? payload.fields.slice(0, 100) : [];

      const formRow = {
        id: formId,
        title,
        description,
        category,
        badge,
        isMultiStep,
        theme,
        settings,
        steps,
        fields,
        shareUrl: `${origin}/f/${formId}`,
        updated_at: new Date().toISOString()
      };

      // 1. Strict PostgreSQL Save
      if (REQUIRE_POSTGRES) {
        if (!pgPool || !pgAvailable) {
          logAuditEvent('DATABASE_PERSISTENCE_ERROR', { operation: 'save_form', formId, error: 'PostgreSQL offline' }, clientIp);
          res.writeHead(503);
          res.end(JSON.stringify({ success: false, error: 'Database persistence failed: Authoritative database is offline.' }));
          return;
        }
        try {
          await pgPool.query(`
            INSERT INTO forms (id, title, description, category, badge, is_multi_step, theme, settings, steps, fields, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              category = EXCLUDED.category,
              badge = EXCLUDED.badge,
              is_multi_step = EXCLUDED.is_multi_step,
              theme = EXCLUDED.theme,
              settings = EXCLUDED.settings,
              steps = EXCLUDED.steps,
              fields = EXCLUDED.fields,
              updated_at = CURRENT_TIMESTAMP
          `, [formId, title, description, category, badge, isMultiStep, JSON.stringify(theme), JSON.stringify(settings), JSON.stringify(steps), JSON.stringify(fields)]);
          
          logAuditEvent('FORM_SAVED', { formId, title, storage: 'postgresql' }, clientIp);
          res.writeHead(200);
          res.end(JSON.stringify(formRow));
          return;
        } catch (err) {
          logAuditEvent('DATABASE_PERSISTENCE_ERROR', { operation: 'save_form', formId, error: err.message }, clientIp);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'Database persistence failed. Form could not be saved to PostgreSQL.' }));
          return;
        }
      }

      // 2. Dual/Fallback Mode
      if (pgPool) {
        try {
          await pgPool.query(`
            INSERT INTO forms (id, title, description, category, badge, is_multi_step, theme, settings, steps, fields, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title,
              description = EXCLUDED.description,
              category = EXCLUDED.category,
              badge = EXCLUDED.badge,
              is_multi_step = EXCLUDED.is_multi_step,
              theme = EXCLUDED.theme,
              settings = EXCLUDED.settings,
              steps = EXCLUDED.steps,
              fields = EXCLUDED.fields,
              updated_at = CURRENT_TIMESTAMP
          `, [formId, title, description, category, badge, isMultiStep, JSON.stringify(theme), JSON.stringify(settings), JSON.stringify(steps), JSON.stringify(fields)]);
          pgAvailable = true;
        } catch (err) {
          console.warn('PostgreSQL save failed:', err.message);
          pgAvailable = false;
          logAuditEvent('DATABASE_PERSISTENCE_WARNING', { operation: 'save_form', formId, error: err.message }, clientIp);
          res.setHeader('X-Database-Fallback', 'true');
        }
      }

      // Local File Save (Fallback Mode only)
      const localForms = getLocalForms();
      const existingIdx = localForms.findIndex(f => f.id === formId);
      if (existingIdx >= 0) {
        localForms[existingIdx] = formRow;
      } else {
        localForms.unshift(formRow);
      }
      saveLocalForms(localForms);

      logAuditEvent('FORM_SAVED', { formId, title, storage: 'local_json' }, clientIp);
      res.writeHead(200);
      res.end(JSON.stringify(formRow));
      return;
    }

    // --- DELETE Form ---
    if (req.method === 'DELETE') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
      if (!verifySessionToken(token)) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Admin authorization required to delete forms.' }));
        return;
      }

      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing form ID' }));
        return;
      }

      if (pgPool) {
        try { await pgPool.query('DELETE FROM forms WHERE id = $1', [id]); } catch {}
      }

      const localForms = getLocalForms().filter(f => f.id !== id);
      saveLocalForms(localForms);

      logAuditEvent('FORM_DELETED', { formId: id }, clientIp);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, id }));
      return;
    }
  }

  // 4. Submissions API (GET & POST)
  if (pathname === '/api/submissions') {
    res.setHeader('Content-Type', 'application/json');

    // --- GET Submissions (Admin Only) ---
    if (req.method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

      if (!verifySessionToken(token)) {
        logAuditEvent('UNAUTHORIZED_SUBMISSIONS_ACCESS', { formId: parsedUrl.searchParams.get('formId') }, clientIp);
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized. Administrator authentication required to access form submissions.' }));
        return;
      }

      const formId = parsedUrl.searchParams.get('formId');
      let subs = [];

      // 1. PostgreSQL
      if (pgPool && pgAvailable) {
        try {
          const query = formId
            ? 'SELECT * FROM submissions WHERE form_id = $1 ORDER BY submitted_at DESC'
            : 'SELECT * FROM submissions ORDER BY submitted_at DESC';
          const params = formId ? [formId] : [];
          const r = await pgPool.query(query, params);
          subs = r.rows.map(row => ({
            id: row.id,
            formId: row.form_id,
            submittedAt: row.submitted_at,
            durationSeconds: row.duration_seconds,
            data: decryptSubmissionPayload(row.data || {})
          }));
        } catch (err) {
          logAuditEvent('DATABASE_READ_ERROR', { operation: 'get_submissions', formId, error: err.message }, clientIp);
          if (REQUIRE_POSTGRES) {
            res.writeHead(503);
            res.end(JSON.stringify({ error: 'Authoritative database query failed.' }));
            return;
          }
        }
      } else if (REQUIRE_POSTGRES) {
        res.writeHead(503);
        res.end(JSON.stringify({ error: 'Authoritative database is offline. Fallback disabled.' }));
        return;
      }

      // 2. Local Fallback (only when strict PostgreSQL mode is disabled)
      if (subs.length === 0 && !REQUIRE_POSTGRES) {
        const localSubs = getLocalSubmissions();
        const filtered = formId ? localSubs.filter(s => (s.form_id === formId || s.formId === formId)) : localSubs;
        subs = filtered.map(s => ({
          ...s,
          data: decryptSubmissionPayload(s.data || {})
        }));
      }

      logAuditEvent('SUBMISSIONS_ACCESSED', { formId, count: subs.length }, clientIp);
      res.writeHead(200);
      res.end(JSON.stringify(subs));
      return;
    }

    // --- POST Submission (Public Respondent) ---
    if (req.method === 'POST') {
      if (!checkRateLimit(clientIp, 'submission', 40, 60000)) {
        res.writeHead(429);
        res.end(JSON.stringify({ error: 'Too many submissions. Please slow down.' }));
        return;
      }

      let payload;
      try {
        payload = await getRequestBody(req);
      } catch {
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'Payload too large' }));
        return;
      }

      const formId = payload.formId || payload.form_id;
      if (!formId || typeof formId !== 'string') {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Valid Form ID is required for response submission' }));
        return;
      }

      let targetForm = null;
      if (pgPool && pgAvailable) {
        try {
          const r = await pgPool.query('SELECT * FROM forms WHERE id = $1 LIMIT 1', [formId]);
          if (r.rows.length > 0) targetForm = r.rows[0];
        } catch {}
      }
      if (!targetForm) {
        targetForm = getLocalForms().find(f => f.id === formId);
      }

      if (targetForm && targetForm.settings) {
        const settings = typeof targetForm.settings === 'string' ? JSON.parse(targetForm.settings) : targetForm.settings;
        if (settings.acceptingResponses === false) {
          res.writeHead(403);
          res.end(JSON.stringify({ error: settings.closedMessage || 'This form is no longer accepting responses.' }));
          return;
        }
        if (settings.hasEndTime && settings.endDateTime) {
          const deadline = new Date(settings.endDateTime).getTime();
          if (Date.now() >= deadline) {
            res.writeHead(403);
            res.end(JSON.stringify({ error: settings.closedMessage || 'The deadline for this form has passed.' }));
            return;
          }
        }
      }

      const subId = (payload.id && typeof payload.id === 'string')
        ? payload.id
        : `sub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const submittedAt = payload.submittedAt || new Date().toISOString();
      const durationSeconds = Math.min(Math.max(parseInt(payload.durationSeconds || '60', 10), 1), 86400);
      const rawData = (payload.data && typeof payload.data === 'object') ? payload.data : {};

      const encryptedData = encryptSubmissionPayload(rawData);

      const subRow = {
        id: subId,
        formId,
        form_id: formId,
        submittedAt,
        durationSeconds,
        data: encryptedData
      };

      // 1. Strict PostgreSQL Save
      if (REQUIRE_POSTGRES) {
        if (!pgPool || !pgAvailable) {
          logAuditEvent('DATABASE_PERSISTENCE_ERROR', { operation: 'save_submission', subId, formId, error: 'PostgreSQL offline' }, clientIp);
          res.writeHead(503);
          res.end(JSON.stringify({ success: false, error: 'Database persistence failed: Authoritative database is offline.' }));
          return;
        }
        try {
          const insertRes = await pgPool.query(`
            INSERT INTO submissions (id, form_id, submitted_at, duration_seconds, data)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
          `, [subId, formId, submittedAt, durationSeconds, JSON.stringify(encryptedData)]);

          if (insertRes.rowCount === 0) {
            logAuditEvent('DUPLICATE_SUBMISSION_IGNORED', { subId, formId }, clientIp);
          }

          logAuditEvent('RESPONSE_SUBMITTED', { formId, subId, storage: 'postgresql' }, clientIp);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, id: subId, submittedAt }));
          return;
        } catch (err) {
          logAuditEvent('DATABASE_PERSISTENCE_ERROR', { operation: 'save_submission', subId, formId, error: err.message }, clientIp);
          res.writeHead(500);
          res.end(JSON.stringify({ success: false, error: 'Database persistence failed. Response could not be saved to PostgreSQL.' }));
          return;
        }
      }

      // 2. Dual/Fallback Mode
      if (pgPool) {
        try {
          await pgPool.query(`
            INSERT INTO submissions (id, form_id, submitted_at, duration_seconds, data)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO NOTHING
          `, [subId, formId, submittedAt, durationSeconds, JSON.stringify(encryptedData)]);
          pgAvailable = true;
        } catch (err) {
          console.warn('PostgreSQL submission insert warning:', err.message);
          pgAvailable = false;
          logAuditEvent('DATABASE_PERSISTENCE_WARNING', { operation: 'save_submission', subId, formId, error: err.message }, clientIp);
          res.setHeader('X-Database-Fallback', 'true');
        }
      }

      // Local File Save (Fallback Mode only)
      const localSubs = getLocalSubmissions();
      localSubs.unshift(subRow);
      saveLocalSubmissions(localSubs);

      logAuditEvent('RESPONSE_SUBMITTED', { formId, subId, storage: 'local_json' }, clientIp);
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, id: subId, submittedAt }));
      return;
    }
  }

  // 5. File Upload & Private Storage API
  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!checkRateLimit(clientIp, 'upload', 10, 60000)) {
      res.writeHead(429);
      res.end(JSON.stringify({ error: 'Upload rate limit exceeded.' }));
      return;
    }

    let payload;
    try {
      payload = await getRequestBody(req);
    } catch {
      res.writeHead(413);
      res.end(JSON.stringify({ error: 'File size exceeds maximum allowable limit.' }));
      return;
    }

    const { fileName, fileData, mimeType } = payload;
    if (!fileName || !fileData) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing fileName or fileData' }));
      return;
    }

    const safeExt = path.extname(fileName).toLowerCase().substring(0, 10);
    const ALLOWED_EXTS = ['.pdf', '.docx', '.doc', '.png', '.jpg', '.jpeg', '.webp', '.txt', '.csv'];
    if (!ALLOWED_EXTS.includes(safeExt)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'File type not allowed. Supported formats: PDF, DOCX, PNG, JPG, WEBP, CSV, TXT.' }));
      return;
    }

    const fileId = `file-${crypto.randomBytes(16).toString('hex')}${safeExt}`;
    const targetFilePath = path.join(UPLOADS_DIR, fileId);

    try {
      const base64Content = fileData.includes(',') ? fileData.split(',')[1] : fileData;
      const buffer = Buffer.from(base64Content, 'base64');
      if (buffer.length > 15 * 1024 * 1024) {
        res.writeHead(413);
        res.end(JSON.stringify({ error: 'File exceeds 15MB size limit.' }));
        return;
      }

      fs.writeFileSync(targetFilePath, buffer);
      logAuditEvent('FILE_UPLOADED', { fileId, originalName: path.basename(fileName), size: buffer.length }, clientIp);

      res.writeHead(200);
      res.end(JSON.stringify({
        fileId,
        fileName: path.basename(fileName),
        fileSize: `${Math.round(buffer.length / 1024)} KB`,
        url: `/api/files/${fileId}`
      }));
      return;
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'File upload processing failed.' }));
      return;
    }
  }

  // 6. Safe Private File Retrieval
  if (pathname.startsWith('/api/files/') || req.url.includes('/api/files/')) {
    const rawReqUrl = decodeURIComponent(req.url);
    if (rawReqUrl.includes('..')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied: Path Traversal Detected');
      return;
    }

    const rawFileParam = decodeURIComponent(pathname.replace(/^\/api\/files\/?/, ''));
    if (!rawFileParam || rawFileParam.includes('..') || rawFileParam.includes('/') || rawFileParam.includes('\\')) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied: Invalid File Identifier');
      return;
    }

    const fileId = path.basename(rawFileParam);
    const safePath = path.resolve(UPLOADS_DIR, fileId);

    if (!safePath.startsWith(path.resolve(UPLOADS_DIR))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Access Denied');
      return;
    }

    fs.stat(safePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }

      const ext = path.extname(safePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileId}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=86400'
      });

      const stream = fs.createReadStream(safePath);
      stream.pipe(res);
    });
    return;
  }

  // --- Clean URL Routing & Static File Serving ---
  let safePath = path.normalize(decodeURI(pathname)).replace(/^(\.\.[\/\\])+/, '');
  const ext = path.extname(safePath).toLowerCase();

  if (ext) {
    if (safePath.startsWith('/f/') || safePath.startsWith('\\f\\')) {
      safePath = safePath.substring(2);
    } else if (safePath.startsWith('/form/') || safePath.startsWith('\\form\\')) {
      safePath = safePath.substring(5);
    }
  } else {
    // SPA deep routing: /admin, /f/:id, /form/:id, /
    if (
      safePath === '/' || 
      safePath === '\\' || 
      safePath === '/admin' || 
      safePath === '\\admin' ||
      safePath.startsWith('/f/') || 
      safePath.startsWith('\\f\\') ||
      safePath.startsWith('/form/') || 
      safePath.startsWith('\\form\\')
    ) {
      safePath = '/index.html';
    }
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const fileExt = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[fileExt] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': fileExt === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function startServer(port) {
  const s = server.listen(port, '0.0.0.0', () => {
    console.log(`Forms by Varunya tech server running at http://0.0.0.0:${port}`);
    console.log(`Public canonical origin: ${APP_URL || `http://localhost:${port}`}`);
    console.log(`Database engine: ${pgAvailable ? 'PostgreSQL (Self-Hosted)' : 'Local File Store'}`);
    console.log(`Security: AES-256-GCM Field Encryption & Rate Limiting ACTIVE`);
  });

  s.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  return s;
}

// Graceful Shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  server.close(() => {
    if (pgPool) pgPool.end().catch(() => {});
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Closing server gracefully...');
  server.close(() => {
    if (pgPool) pgPool.end().catch(() => {});
    process.exit(0);
  });
});

if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = {
  server,
  startServer,
  initPgDatabase,
  setRequirePostgres,
  encryptField,
  decryptField,
  encryptSubmissionPayload,
  decryptSubmissionPayload
};
