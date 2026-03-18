const GHL_API_KEY   = process.env.GHL_API_KEY;
const LOCATION_ID   = process.env.GHL_LOCATION_ID || "TVnVIKtzPOvL3AU4elns";
const GHL_API_BASE  = "https://services.leadconnectorhq.com";
const GHL_VERSION   = "2021-07-28";

const TAG_MAP = {
  cs1:       "case-study-tradeshow",
  cs2:       "case-study-scraper",
  cs3:       "case-study-chatbot",
  tradeshow: "case-study-tradeshow",
  scraper:   "case-study-scraper",
  chatbot:   "case-study-chatbot"
};

async function ghl(path, method, body) {
  const res = await fetch(`${GHL_API_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${GHL_API_KEY}`,
      "Version": GHL_VERSION,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!GHL_API_KEY) return res.status(500).json({ error: "API key not configured" });

  const { firstName, email, company, cases } = req.body || {};

  if (!firstName || !email || !Array.isArray(cases) || cases.length === 0) {
    return res.status(400).json({ error: "firstName, email, and cases are required" });
  }

  const tags = cases.map(id => TAG_MAP[id]).filter(Boolean);
  if (tags.length === 0) return res.status(400).json({ error: "No valid case IDs" });

  // Try to create the contact
  const payload = { locationId: LOCATION_ID, firstName, email, tags };
  if (company) payload.companyName = company;

  let { status, data } = await ghl("/contacts/", "POST", payload);

  // If contact already exists (422), look it up and add tags
  if (status === 422) {
    const search = await ghl(`/contacts/?locationId=${LOCATION_ID}&email=${encodeURIComponent(email)}`, "GET");
    const contactId = search.data?.contacts?.[0]?.id;
    if (contactId) {
      await ghl(`/contacts/${contactId}/tags`, "POST", { tags });
    }
  } else if (status >= 400) {
    return res.status(500).json({ error: "GHL error", ghl_status: status, ghl_response: data });
  }

  return res.status(200).json({ success: true });
}
