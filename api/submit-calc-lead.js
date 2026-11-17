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
const isRateLimited = createRateLimiter(5);

module.exports = async function handler(req, res) {
  if (!beginRequest(req, res)) return;
  const { firstName, email, annualCost, currency, weeklySummary, website } = req.body || {};
  if (!validText(website, 200)) return res.status(400).json({ error: 'Invalid request' });
  if (website.trim()) return res.status(200).json({ success: true });
  if (!validText(firstName, 100, true) || !validText(email, 254, true) ||
      (annualCost !== undefined && (typeof annualCost !== 'number' || !Number.isFinite(annualCost))) ||
      (currency !== undefined && !validText(currency, 3)) || (weeklySummary !== undefined && !validText(weeklySummary, 500))) return res.status(400).json({ error: 'Invalid request' });
  if (!validEmail(email) || (currency !== undefined && !['CHF', 'EUR', 'USD'].includes(currency))) return res.status(400).json({ error: 'Invalid request' });
  if (isRateLimited(requestIp(req))) return res.status(429).json({ error: 'Please try again later' });
  if (!process.env.GHL_API_KEY) { console.error('GHL_API_KEY is not configured'); return genericFailure(res, 500); }

  const safeCost = typeof annualCost === 'number' ? Math.round(annualCost) : null;
  const safeCurrency = currency || 'CHF';
  const note = ['Source: Time & Cost Leak Calculator', safeCost !== null ? `Estimated annual cost: ${safeCurrency} ${safeCost.toLocaleString()}` : '', weeklySummary ? `Weekly summary: ${weeklySummary.trim()}` : ''].filter(Boolean).join('\n');
  try {
    const created = await ghl('/contacts/', 'POST', { locationId: LOCATION_ID, firstName: firstName.trim(), email: email.trim().toLowerCase(), tags: ['calculator-lead'], customFields: safeCost === null ? [] : [{ key: 'calc_annual_cost', field_value: String(safeCost) }, { key: 'calc_currency', field_value: safeCurrency }] });
    const duplicateContact = created.status === 400;
    const contactId = created.status >= 200 && created.status < 300 ? created.data?.contact?.id : (duplicateContact ? created.data?.meta?.contactId : undefined);
    if (!contactId) { console.error('GHL contact error', created.status); return genericFailure(res); }
    if (duplicateContact) {
      const existing = await ghl(`/contacts/${contactId}`, 'GET');
      if (existing.status < 200 || existing.status >= 300) { console.error('GHL tag read error', existing.status); return genericFailure(res); }
      const oldTags = Array.isArray(existing.data?.contact?.tags) ? existing.data.contact.tags : [];
      const tagged = await ghl(`/contacts/${contactId}`, 'PUT', { tags: [...new Set([...oldTags, 'calculator-lead'])] });
      if (tagged.status < 200 || tagged.status >= 300) { console.error('GHL tag update error', tagged.status); return genericFailure(res); }
    }
    // Notes are intentionally best-effort once the contact has been created.
    if (note) try { const noted = await ghl(`/contacts/${contactId}/notes`, 'POST', { body: note }); if (noted.status < 200 || noted.status >= 300) console.error('GHL note failed', noted.status); } catch (error) { console.error('GHL note failed', error); }
    return res.status(200).json({ success: true });
  } catch (error) { console.error('Calculator CRM request failed', error); return genericFailure(res); }
};
