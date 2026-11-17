const ALLOWED_ORIGINS = new Set(['https://www.gamperklimmek.com', 'https://gamperklimmek.com']);
const PREVIEW_ORIGIN = /^https:\/\/lucen-studios-[a-z0-9-]+-jessica-8829s-projects\.vercel\.app$/;
const GHL_VERSION = '2021-07-28';
function allowedOrigin(origin) {
  return typeof origin === 'string' && (ALLOWED_ORIGINS.has(origin) || PREVIEW_ORIGIN.test(origin));
}
function beginRequest(req, res) {
  const origin = req.headers?.origin;
  if (allowedOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    if (allowedOrigin(origin)) res.status(204).end(); else res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return false; }
  if (!allowedOrigin(origin)) { res.status(403).json({ error: 'Forbidden' }); return false; }
  return true;
}
function createRateLimiter(max, windowMs = 10 * 60 * 1000) {
  const entries = new Map();
  // This per-instance in-memory limiter resets on cold starts; no KV is available.
  return ip => {
    const now = Date.now();
    const entry = entries.get(ip) || { count: 0, resetAt: now + windowMs };
    if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
    entry.count += 1;
    entries.set(ip, entry);
    if (entries.size > 500) for (const [key, value] of entries) if (now > value.resetAt) entries.delete(key);
    return entry.count > max;
  };
}
const validText = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const validEmail = value => validText(value, 254, true) && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
const requestIp = req => req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
async function ghl(path, method, body) {
  const response = await fetch(`${process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com'}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GHL_API_KEY}`, Version: GHL_VERSION, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}
const genericFailure = (res, status = 502) => res.status(status).json({ error: 'Unable to process request' });

const LOCATION_ID = process.env.GHL_LOCATION_ID || 'TVnVIKtzPOvL3AU4elns';
const WORKFLOW_MAP = { cs1: 'bd09edf6-8bb8-4084-baf4-9b1eacac2cf3', cs2: '928c23d3-983e-43ee-87a4-7a0359ee6b78', cs3: '080d82bc-ab78-475c-b5a8-ca7f6c25171f' };
const CASE_ALIASES = { cs1: 'cs1', cs2: 'cs2', cs3: 'cs3', tradeshow: 'cs1', scraper: 'cs2', chatbot: 'cs3' };
const isRateLimited = createRateLimiter(5);

module.exports = async function handler(req, res) {
  if (!beginRequest(req, res)) return;
  const { firstName, email, company, cases, website } = req.body || {};
  if (!validText(website, 200)) return res.status(400).json({ error: 'Invalid request' });
  if (website.trim()) return res.status(200).json({ success: true });
  if (!validText(firstName, 100, true) || !validText(email, 254, true) ||
      (company !== undefined && !validText(company, 200)) || !Array.isArray(cases) || !cases.length || cases.length > Object.keys(WORKFLOW_MAP).length ||
      !cases.every(value => typeof value === 'string' && value.length <= 20 && Object.hasOwn(CASE_ALIASES, value))) return res.status(400).json({ error: 'Invalid request' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Invalid request' });
  const selectedCases = [...new Set(cases.map(value => CASE_ALIASES[value]))];
  if (isRateLimited(requestIp(req))) return res.status(429).json({ error: 'Please try again later' });
  if (!process.env.GHL_API_KEY) { console.error('GHL_API_KEY is not configured'); return genericFailure(res, 500); }
  try {
    const payload = { locationId: LOCATION_ID, firstName: firstName.trim(), email: email.trim().toLowerCase() };
    if (company) payload.companyName = company.trim();
    const created = await ghl('/contacts/', 'POST', payload);
    const contactId = created.status >= 200 && created.status < 300 ? created.data?.contact?.id : (created.status === 400 ? created.data?.meta?.contactId : undefined);
    if (!contactId) { console.error('GHL contact error', created.status); return genericFailure(res); }
    const workflows = await Promise.all(selectedCases.map(caseId => ghl(`/contacts/${contactId}/workflow/${WORKFLOW_MAP[caseId]}`, 'POST', {})));
    if (workflows.some(result => result.status < 200 || result.status >= 300)) { console.error('GHL workflow enrollment failed', workflows.map(result => result.status)); return genericFailure(res); }
    return res.status(200).json({ success: true });
  } catch (error) { console.error('Case-study CRM request failed', error); return genericFailure(res); }
};
