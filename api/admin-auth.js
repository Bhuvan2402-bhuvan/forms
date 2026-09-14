import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brfhqgdvyqustbjndrex.supabase.co';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || Buffer.from('c2Jfc2VjcmV0X0l1dDNYTm81NXpGNk5ObEhMWXZNTUFfVnBjSldUTm8=', 'base64').toString('utf8');
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'formcraft_admin_secret_key_2026';
const DEFAULT_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

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
    exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
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

async function getStoredCredential() {
  const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  try {
    const res = await fetch(`${baseUrl}/admin_auth?id=eq.admin_credential&select=*`, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0];
      }
    }
  } catch (err) {
    console.error('Error fetching admin_auth from Supabase:', err.message);
  }
  return null;
}

async function saveStoredCredential(passwordHash, salt) {
  const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  try {
    const res = await fetch(`${baseUrl}/admin_auth`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        id: 'admin_credential',
        password_hash: passwordHash,
        salt,
        updated_at: new Date().toISOString()
      })
    });
    return res.ok;
  } catch (err) {
    console.error('Error saving admin_auth to Supabase:', err.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const action = req.query.action || payload.action || 'verify';

  // 1. VERIFY SESSION
  if (action === 'verify' || req.method === 'GET') {
    const authHeader = req.headers.authorization || '';
    const token = payload.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);
    const isValid = verifySessionToken(token);
    return res.status(200).json({ authenticated: isValid });
  }

  // 2. LOGIN
  if (action === 'login' && req.method === 'POST') {
    const inputPassword = payload.password;
    if (!inputPassword) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const stored = await getStoredCredential();
    let isMatch = false;

    if (stored && stored.password_hash && stored.salt) {
      isMatch = verifyPassword(inputPassword, stored.salt, stored.password_hash);
    } else {
      // Compare with default password
      isMatch = inputPassword === DEFAULT_PASSWORD;
      // If matches default, automatically seed database entity
      if (isMatch) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = hashPassword(inputPassword, salt);
        await saveStoredCredential(hash, salt).catch(() => {});
      }
    }

    if (isMatch) {
      const token = createSessionToken();
      return res.status(200).json({
        success: true,
        token,
        expiresIn: 86400,
        message: 'Authentication successful'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid admin password'
    });
  }

  // 3. CHANGE PASSWORD
  if (action === 'change-password' && req.method === 'POST') {
    const authHeader = req.headers.authorization || '';
    const token = payload.token || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null);

    if (!verifySessionToken(token)) {
      return res.status(401).json({ error: 'Unauthorized. Please log in first.' });
    }

    const { currentPassword, newPassword } = payload;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const stored = await getStoredCredential();
    let isCurrentMatch = false;

    if (stored && stored.password_hash && stored.salt) {
      isCurrentMatch = verifyPassword(currentPassword, stored.salt, stored.password_hash);
    } else {
      isCurrentMatch = currentPassword === DEFAULT_PASSWORD;
    }

    if (!isCurrentMatch) {
      return res.status(401).json({ error: 'Incorrect current password' });
    }

    const newSalt = crypto.randomBytes(16).toString('hex');
    const newHash = hashPassword(newPassword, newSalt);
    const saved = await saveStoredCredential(newHash, newSalt);

    const freshToken = createSessionToken();
    return res.status(200).json({
      success: true,
      persistedInDb: saved,
      token: freshToken,
      message: 'Admin password successfully updated'
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
