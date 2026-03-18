const GHL_API_KEY   = process.env.GHL_API_KEY;
const LOCATION_ID   = process.env.GHL_LOCATION_ID || "TVnVIKtzPOvL3AU4elns";
const GHL_API_BASE  = "https://services.leadconnectorhq.com";
const GHL_VERSION   = "2021-07-28";

const WORKFLOW_MAP = {
  cs1: "bd09edf6-8bb8-4084-baf4-9b1eacac2cf3",
  cs2: "928c23d3-983e-43ee-87a4-7a0359ee6b78",
  cs3: "080d82bc-ab78-475c-b5a8-ca7f6c25171f"
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

  const workflowIds = cases.map(id => WORKFLOW_MAP[id]).filter(Boolean);
  if (workflowIds.length === 0) return res.status(400).json({ error: "No valid case IDs" });

  // Create or find the contact
  const payload = { locationId: LOCATION_ID, firstName, email };
  if (company) payload.companyName = company;

  let { status, data } = await ghl("/contacts/", "POST", payload);

  let contactId;
  if (status === 400 && data?.meta?.contactId) {
    contactId = data.meta.contactId;
  } else if (status >= 400) {
    return res.status(500).json({ error: "GHL error", ghl_status: status, ghl_response: data });
  } else {
    contactId = data?.contact?.id;
  }

  if (!contactId) return res.status(500).json({ error: "Could not resolve contact ID" });

  // Enroll contact in each selected workflow directly
  await Promise.all(
    workflowIds.map(wfId =>
      ghl(`/contacts/${contactId}/workflow/${wfId}`, "POST", {})
    )
  );

  return res.status(200).json({ success: true });
}
