const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Basic zero-dependency .env loader
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=');
        if (key && vals.length > 0) {
          process.env[key.trim()] = vals.join('=').trim();
        }
      }
    });
  }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brfhqgdvyqustbjndrex.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_5g2-ZrIzuXVDR10Eo2LB7A_JU8b4jD3';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || Buffer.from('c2Jfc2VjcmV0X0l1dDNYTm81NXpGNk5ObEhMWXZNTUFfVnBjSldUTm8=', 'base64').toString('utf8');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'formcraft_admin_secret_key_2026';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_PORT = process.env.PORT || 3005;
const PUBLIC_DIR = __dirname;

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

// Supabase REST helper
async function callSupabaseRest(endpoint, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    return { ok: false, error: 'Supabase credentials missing on server.' };
  }
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${endpoint}`;
  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': options.prefer || 'return=representation',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 500, error: err.message };
  }
}

// Read request body JSON
function getRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Endpoints ---
  
  // 0. Admin Authentication API
  if (pathname === '/api/admin-auth' || pathname.startsWith('/api/admin/')) {
    res.setHeader('Content-Type', 'application/json');
    const payload = await getRequestBody(req);
    const action = parsedUrl.searchParams.get('action') || payload.action || (pathname.endsWith('/login') ? 'login' : pathname.endsWith('/change-password') ? 'change-password' : 'verify');

    // Helper functions for credential entity
    async function getStoredCredential() {
      const result = await callSupabaseRest('admin_auth?id=eq.admin_credential&select=*');
      if (result.ok && Array.isArray(result.data) && result.data.length > 0) {
        return result.data[0];
      }
      return null;
    }

    async function saveStoredCredential(passwordHash, salt) {
      const result = await callSupabaseRest('admin_auth', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          id: 'admin_credential',
          password_hash: passwordHash,
          salt,
          updated_at: new Date().toISOString()
        }
      });
      return result.ok;
    }

    // Verify session
    if (action === 'verify' || req.method === 'GET') {
      const authHeader = req.headers.authorization || '';
      const token = payload.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);
      const isValid = verifySessionToken(token);
      res.writeHead(200);
      res.end(JSON.stringify({ authenticated: isValid }));
      return;
    }

    // Login
    if (action === 'login' && req.method === 'POST') {
      const inputPassword = payload.password;
      if (!inputPassword) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Password is required' }));
        return;
      }

      const stored = await getStoredCredential();
      let isMatch = false;

      if (stored && stored.password_hash && stored.salt) {
        isMatch = verifyPassword(inputPassword, stored.salt, stored.password_hash);
      } else {
        isMatch = inputPassword === DEFAULT_PASSWORD;
        if (isMatch) {
          const salt = crypto.randomBytes(16).toString('hex');
          const hash = hashPassword(inputPassword, salt);
          await saveStoredCredential(hash, salt).catch(() => {});
        }
      }

      if (isMatch) {
        const token = createSessionToken();
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          token,
          expiresIn: 86400,
          message: 'Authentication successful'
        }));
        return;
      }

      res.writeHead(401);
      res.end(JSON.stringify({
        success: false,
        error: 'Invalid admin password'
      }));
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
      if (!currentPassword || !newPassword) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Both current password and new password are required' }));
        return;
      }

      if (newPassword.length < 6) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'New password must be at least 6 characters' }));
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
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Incorrect current password' }));
        return;
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newHash = hashPassword(newPassword, newSalt);
      const saved = await saveStoredCredential(newHash, newSalt);

      const freshToken = createSessionToken();
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        persistedInDb: saved,
        token: freshToken,
        message: 'Admin password successfully updated'
      }));
      return;
    }

    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  // 1. Supabase Status Check
  if (pathname === '/api/supabase/status' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    if (!SUPABASE_URL) {
      res.writeHead(200);
      res.end(JSON.stringify({ connected: false, reason: 'SUPABASE_URL not configured' }));
      return;
    }

    // Check if forms table is ready
    const testResult = await callSupabaseRest('forms?limit=1');
    const tablesReady = testResult.ok || (testResult.status !== 404 && testResult.data?.code !== 'PGRST205');

    res.writeHead(200);
    res.end(JSON.stringify({
      connected: true,
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      tablesReady: tablesReady,
      details: testResult.data
    }));
    return;
  }

  // 2. Forms API (GET & POST)
  if (pathname === '/api/forms') {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET') {
      const result = await callSupabaseRest('forms?select=*&order=updated_at.desc');
      res.writeHead(result.ok ? 200 : (result.status || 500));
      res.end(JSON.stringify(result.data));
      return;
    }

    if (req.method === 'POST') {
      const payload = await getRequestBody(req);
      const row = {
        id: payload.id,
        title: payload.title,
        description: payload.description || '',
        category: payload.category || 'Custom',
        badge: payload.badge || 'Single Page Form',
        is_multi_step: !!payload.isMultiStep,
        theme: payload.theme || {},
        settings: payload.settings || {
          acceptingResponses: true,
          hasEndTime: false,
          endDateTime: null,
          closedMessage: "This form is no longer accepting responses. The deadline for submission has passed."
        },
        steps: payload.steps || [],
        fields: payload.fields || [],
        updated_at: new Date().toISOString()
      };

      const result = await callSupabaseRest('forms', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: row
      });

      res.writeHead(result.ok ? 200 : (result.status || 500));
      res.end(JSON.stringify(result.data));
      return;
    }

    if (req.method === 'DELETE') {
      const id = parsedUrl.searchParams.get('id');
      if (!id) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Missing form ID' }));
        return;
      }
      const result = await callSupabaseRest(`forms?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      res.writeHead(result.ok ? 200 : (result.status || 500));
      res.end(JSON.stringify({ success: result.ok }));
      return;
    }
  }

  // 3. Submissions API (GET & POST)
  if (pathname === '/api/submissions') {
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET') {
      const formId = parsedUrl.searchParams.get('formId');
      const query = formId ? `submissions?form_id=eq.${encodeURIComponent(formId)}&order=submitted_at.desc` : 'submissions?select=*&order=submitted_at.desc';
      const result = await callSupabaseRest(query);
      res.writeHead(result.ok ? 200 : (result.status || 500));
      res.end(JSON.stringify(result.data));
      return;
    }

    if (req.method === 'POST') {
      const payload = await getRequestBody(req);
      const row = {
        id: payload.id,
        form_id: payload.formId,
        submitted_at: payload.submittedAt || new Date().toISOString(),
        duration_seconds: payload.durationSeconds || 60,
        data: payload.data || {}
      };

      const result = await callSupabaseRest('submissions', {
        method: 'POST',
        prefer: 'return=representation',
        body: row
      });

      res.writeHead(result.ok ? 200 : (result.status || 500));
      res.end(JSON.stringify(result.data));
      return;
    }
  }

  // --- Clean URL Routing & Static File Serving ---
  let safePath = path.normalize(decodeURI(pathname)).replace(/^(\.\.[\/\\])+/, '');
  const ext = path.extname(safePath).toLowerCase();

  // If request has a file extension but is prefixed by /f/ or /form/, strip prefix
  if (ext) {
    if (safePath.startsWith('/f/') || safePath.startsWith('\\f\\')) {
      safePath = safePath.substring(2);
    } else if (safePath.startsWith('/form/') || safePath.startsWith('\\form\\')) {
      safePath = safePath.substring(5);
    }
  } else {
    // No extension -> Route to index.html for SPA routing (/admin, /f/:id, /form/:id)
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

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

function startServer(port) {
  server.listen(port, () => {
    console.log(`Forms by Varunya tech server running at http://localhost:${port}`);
    console.log(`All rights reserved to Bhuvana Mohan Chowdary.`);
    console.log(`Supabase URL: ${SUPABASE_URL || 'Not configured'}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(Number(DEFAULT_PORT));
