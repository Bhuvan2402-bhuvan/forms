export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
      const response = await fetch(`${baseUrl}/forms?select=*&order=updated_at.desc`, { headers });
      const data = await response.json();
      const userForms = Array.isArray(data) ? data.filter(f => !f.id?.startsWith('__system_')) : data;
      return res.status(response.ok ? 200 : response.status).json(userForms);
    }

    if (req.method === 'POST') {
      const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
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

      const response = await fetch(`${baseUrl}/forms`, {
        method: 'POST',
        headers: {
          ...headers,
          'Prefer': 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(row)
      });

      const data = await response.json();
      return res.status(response.ok ? 200 : response.status).json(data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) {
        return res.status(400).json({ error: 'Missing form ID' });
      }

      const response = await fetch(`${baseUrl}/forms?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers
      });

      return res.status(response.ok ? 200 : response.status).json({ success: response.ok });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
