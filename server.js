const http = require('http');
const fs = require('fs');
const path = require('path');

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

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || '';
const DEFAULT_PORT = process.env.PORT || 3005;
const PUBLIC_DIR = __dirname;

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
    console.log(`FormCraft Studio server running at http://localhost:${port}`);
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
