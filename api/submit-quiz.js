const GHL_API_KEY  = process.env.GHL_API_KEY;
const LOCATION_ID  = process.env.GHL_LOCATION_ID || 'TVnVIKtzPOvL3AU4elns';
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION  = '2021-07-28';

const VALID_TAGS = new Set(['pain-comms', 'pain-admin', 'pain-followup', 'pain-content']);

const ALLOWED_ORIGINS = [
  'https://www.gamperklimmek.com',
  'https://gamperklimmek.com'
];

function isValidEmail(email) {
  return typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) &&
    email.length <= 254;
}

function isValidOrigin(req) {
  const origin = req.headers['origin'] || '';
  if (!origin) return process.env.VERCEL_ENV !== 'production';
  return ALLOWED_ORIGINS.some(o => origin === o || origin.endsWith('.vercel.app'));
}

async function ghl(path, method, body) {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Version': GHL_VERSION,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

module.exports = async function handler(req, res) {
  /* CORS */
  const origin = req.headers['origin'] || '';
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });
  if (!isValidOrigin(req))     return res.status(403).json({ error: 'Forbidden' });
  if (!GHL_API_KEY)            return res.status(500).json({ error: 'API key not configured' });

  const { firstName, email, painPoint } = req.body || {};

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const tag = `pain-${painPoint}`;
  if (!VALID_TAGS.has(tag)) {
    return res.status(400).json({ error: 'Invalid pain point value' });
  }

  const safeFirst = (firstName || '').trim().slice(0, 100);
  const safeEmail = email.trim().toLowerCase();

  /* Create or find contact */
  let { status, data } = await ghl('/contacts/', 'POST', {
    locationId: LOCATION_ID,
    firstName:  safeFirst,
    email:      safeEmail,
    tags:       [tag, 'source-meggen-golf']
  });

  let contactId;
  if (status === 400 && data?.meta?.contactId) {
    contactId = data.meta.contactId;
  } else if (status >= 400) {
    return res.status(500).json({ error: 'CRM error', detail: status });
  } else {
    contactId = data?.contact?.id;
  }

  if (!contactId) return res.status(500).json({ error: 'Could not resolve contact ID' });

  /* Always apply tags — adds without removing existing tags */
  await ghl(`/contacts/${contactId}/tags`, 'PUT', {
    tags: [tag, 'source-meggen-golf']
  });

  return res.status(200).json({ success: true, contactId });
};
