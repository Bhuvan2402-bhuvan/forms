export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brfhqgdvyqustbjndrex.supabase.co';
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || Buffer.from('c2Jfc2VjcmV0X0l1dDNYTm81NXpGNk5ObEhMWXZNTUFfVnBjSldUTm8=', 'base64').toString('utf8');

  const baseUrl = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;
  const headers = {
    'apikey': SUPABASE_SECRET_KEY,
    'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    if (req.method === 'GET') {
      const formId = req.query.formId;
      const endpoint = formId
        ? `${baseUrl}/submissions?form_id=eq.${encodeURIComponent(formId)}&order=submitted_at.desc`
        : `${baseUrl}/submissions?select=*&order=submitted_at.desc`;

      const response = await fetch(endpoint, { headers });
      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const row = {
        id: payload.id,
        form_id: payload.formId,
        submitted_at: payload.submittedAt || new Date().toISOString(),
        duration_seconds: payload.durationSeconds || 60,
        data: payload.data || {}
      };

      const response = await fetch(`${baseUrl}/submissions`, {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(row)
      });

      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
