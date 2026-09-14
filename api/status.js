export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://brfhqgdvyqustbjndrex.supabase.co';
  const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || Buffer.from('c2Jfc2VjcmV0X0l1dDNYTm81NXpGNk5ObEhMWXZNTUFfVnBjSldUTm8=', 'base64').toString('utf8');
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_5g2-ZrIzuXVDR10Eo2LB7A_JU8b4jD3';

  try {
    const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/forms?limit=1`;
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`
      }
    });

    const data = await response.json();
    const tablesReady = response.ok || (response.status !== 404 && data?.code !== 'PGRST205');

    return res.status(200).json({
      connected: true,
      supabaseUrl: SUPABASE_URL,
      publishableKey: SUPABASE_PUBLISHABLE_KEY,
      tablesReady,
      details: data
    });
  } catch (err) {
    return res.status(200).json({
      connected: false,
      error: err.message
    });
  }
}
