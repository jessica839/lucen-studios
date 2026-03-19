/**
 * Calculator lead capture endpoint.
 * Creates / upserts a GHL contact tagged with their estimated annual cost.
 */
const GHL_API_KEY  = process.env.GHL_API_KEY;
const LOCATION_ID  = process.env.GHL_LOCATION_ID || 'TVnVIKtzPOvL3AU4elns';
const GHL_API_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION  = '2021-07-28';

const ALLOWED_ORIGINS = [
  'https://www.gamperklimmek.com',
  'https://gamperklimmek.com'
];

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_LIMIT_WINDOW_MS; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (rateLimitMap.size > 500) {
    for (const [k, v] of rateLimitMap) { if (Date.now() > v.resetAt) rateLimitMap.delete(k); }
  }
  return entry.count > RATE_LIMIT_MAX;
}

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
  res.setHeader('Access-Control-Allow-Origin',
    ALLOWED_ORIGINS.includes(req.headers['origin'] || '') ? req.headers['origin'] : ALLOWED_ORIGINS[0]);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  if (!isValidOrigin(req)) return res.status(403).json({ error: 'Forbidden' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
             req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  if (!GHL_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { firstName, email, annualCost, currency, weeklySummary } = req.body || {};

  if (!firstName || typeof firstName !== 'string' || firstName.trim().length < 1) {
    return res.status(400).json({ error: 'firstName is required' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  const safeFirst   = firstName.trim().slice(0, 100);
  const safeEmail   = email.trim().toLowerCase();
  const safeCost    = typeof annualCost === 'number' ? Math.round(annualCost) : null;
  const safeCurr    = ['CHF', 'EUR', 'USD'].includes(currency) ? currency : 'CHF';
  const safeWeekly  = typeof weeklySummary === 'string' ? weeklySummary.slice(0, 500) : '';

  /* Build note summarising the calculator result */
  const note = [
    'Source: Time & Cost Leak Calculator',
    safeCost !== null ? `Estimated annual cost: ${safeCurr} ${safeCost.toLocaleString()}` : '',
    safeWeekly ? `Weekly summary: ${safeWeekly}` : ''
  ].filter(Boolean).join('\n');

  const payload = {
    locationId: LOCATION_ID,
    firstName:  safeFirst,
    email:      safeEmail,
    tags:       ['calculator-lead'],
    customFields: safeCost !== null ? [
      { key: 'calc_annual_cost',    field_value: String(safeCost) },
      { key: 'calc_currency',       field_value: safeCurr }
    ] : []
  };

  let { status, data } = await ghl('/contacts/', 'POST', payload);

  let contactId;
  if (status === 400 && data?.meta?.contactId) {
    contactId = data.meta.contactId;
  } else if (status >= 400) {
    return res.status(500).json({ error: 'CRM error', detail: status });
  } else {
    contactId = data?.contact?.id;
  }

  if (!contactId) return res.status(500).json({ error: 'Could not resolve contact ID' });

  /* Add a note with the calculator summary */
  if (note) {
    await ghl('/contacts/' + contactId + '/notes', 'POST', {
      body: note,
      userId: contactId
    }).catch(() => {}); /* notes are best-effort */
  }

  return res.status(200).json({ success: true });
};
