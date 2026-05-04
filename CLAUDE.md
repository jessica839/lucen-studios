# CLAUDE.md

This file provides guidance to Claude when working with code in this repository.

## Project Overview

Static HTML website for **Gamper Klimmek Consulting**, an AI & automation consulting firm targeting owner-operated SMBs. No build system, no package manager — plain HTML, CSS, and vanilla JavaScript deployed on Vercel.

**Live site:** `https://www.gamperklimmek.com`

## Development

**No build step required.** Edit files directly and open in a browser to test. Most features work from `file://` — the only exception is `api/submit-case-study.js` (serverless, requires Vercel or a local Node environment).

**Deployment:** Vercel auto-deploys on push to `main`. Clean URLs are enabled (`/calculator` serves `calculator.html`, etc.).

**Asset caching:** Static assets (`.js`, `.css`, images) are cached for 1 year (`immutable`) by Vercel. HTML files are `no-cache`. When updating shared files like `i18n.js` or `currency.js`, any in-flight visitors will keep the old cached version until their cache expires — no explicit cache-busting mechanism exists.

---

## Service & Pricing

Three fixed-scope offerings. These prices appear throughout the site — keep them consistent everywhere:

| Service | CHF | EUR | USD |
|---|---|---|---|
| Free 30-minute consultation | — | — | — |
| Business Systems Review (BSR) | 950 | 980 | 1,050 |
| Implementation Sprint | 3,500 | 3,610 | 3,889 |

EUR/USD amounts are computed via `currency.js` from `data-price-usd` base values. The CHF price is always the reference. **Never write "Website & Workflow Review" or any other name — the product is called Business Systems Review.**

---

## File Structure

### Pages (one HTML file per page, embedded CSS in `<head>`)

- `index.html` — homepage (hero, calculator, process, who it's for, audit card)
- `calculator.html` — standalone calculator page (`/calculator`)
- `businesses.html` — service page for general SMBs
- `operators.html` — service page for experience/tour operators
- `operators-new.html` — in-progress updated operators page
- `dive-suite.html` — dive-specific product page
- `insurance.html` — service page for independent insurance agencies
- `event-quiz.html` — German-language pain-point quiz (lead-gen, posts to `/api/submit-quiz`)
- `story.html` — team/about page
- `resources.html` — resources/newsletter page
- `start.html` — engagement/start page
- `legal.html` — impressum / legal notices

### JavaScript

- `i18n.js` — all translations and i18n runtime (~2,140 lines); 5 language blocks
- `currency.js` — IP-based currency detection + CHF/EUR/USD manual switcher
- `cookie-consent.js` — GDPR/Swiss nDSG compliant consent banner

### Shared CSS

- `styles.css` — shared design tokens and base styles (used by index + audit pages)
- Per-page styles are embedded in each HTML file's `<head>`

### Serverless API

All three endpoints are Vercel serverless functions that upsert contacts into GoHighLevel. They share the env vars `GHL_API_KEY` and `GHL_LOCATION_ID` (location ID has a hardcoded fallback). Each endpoint enforces an `ALLOWED_ORIGINS` allowlist (`gamperklimmek.com` plus `*.vercel.app` previews).

- `api/submit-case-study.js` — POST `/api/submit-case-study`. Accepts `{ firstName, email, company, cases }` where `cases` is an array of `"cs1"` / `"cs2"` / `"cs3"`. Creates or upserts a GHL contact and enrolls them in the corresponding GHL workflow(s).
- `api/submit-calc-lead.js` — POST `/api/submit-calc-lead`. Calculator lead-capture: tags the GHL contact with their estimated annual cost. Has an in-memory rate limiter (5 requests / 10 min per IP).
- `api/submit-quiz.js` — POST `/api/submit-quiz`. Receives quiz results from `event-quiz.html` and tags the contact with one of the pain-point tags: `pain-comms`, `pain-admin`, `pain-followup`, `pain-content`.

### Config

- `vercel.json` — deployment config (clean URLs, security headers, asset caching)
- `sitemap.xml`, `robots.txt` — SEO

### Email Templates

18 transactional email files for GoHighLevel/FEA Create, covering 3 event types × 6 language variants:

- `email-appointment-confirmed.[lang].html`
- `email-appointment-reminder.[lang].html`
- `email-appointment-requested.[lang].html`

Lang suffixes: `.html` (base/EN fallback), `.en.html`, `.de.html`, `.fr.html`, `.es.html`, `.it.html`

### Deliverables & Docs

- `BSR Template — Gamper Klimmek.docx` — Business Systems Review report template (Word, used as the tangible deliverable for the CHF 950 service)
- `GamperKlimmek_CaseStudy2_LeadScraper.docx`, `GamperKlimmek_CaseStudy3_DiveChatbot.docx`, `GamperKlimmek_TradeShow_CaseStudy.docx` — client case studies
- `Lucen_Studios_Master_Strategy_v2.docx` — internal strategy doc
- `fea-create-case-study-automations.md` — FEA Create integration notes

---

## Internationalization

All user-facing text lives in `i18n.js` as a flat key-value store per language:

```js
const translations = {
  en: {
    'nav.cta':   'Run the Time & Cost Leak Calculator',
    'hero.h1':   'Most businesses still run on ...',
    // ...
  },
  de: { ... },
  fr: { ... },
  es: { ... },
  it: { ... }
}
```

**This is a flat structure — not nested by page.** All keys live in a single object per language.

### Static HTML elements

Use `data-i18n="key"` attributes. The runtime calls `document.querySelectorAll('[data-i18n]')` on load and language switch, replacing `innerHTML` (HTML tags like `<em>` are supported).

### Dynamic JS content (calculator, workflow audit)

Use the `i18nText(key, fallback)` helper defined in `calculator.html`:

```js
function i18nText(key, fallback) {
  if (typeof t === "function") return t(key) || fallback;
  return fallback;
}
```

Always provide a meaningful English fallback string — it's shown if i18n.js hasn't loaded yet.

### Language preference

Stored in `localStorage` under `gk_lang`. Default: `en`. Auto-detected from browser on first visit. The on-site language switcher lists **EN, DE, and FR** only; Spanish and Italian blocks remain in `i18n.js` (and still apply for browser auto-detect / saved preference) but are not offered as toggle options.

### When editing copy

Update **both**:
1. The `data-i18n` attribute in HTML (or the `i18nText()` call in JS)
2. All 5 language entries in `i18n.js` — keys must exist in `en`, `de`, `fr`, `es`, `it`

Key blocks to know in `i18n.js`:
- `calc.*` — calculator inputs/results
- `audit.*` — Business Systems Review card on homepage
- `audit.heading`, `audit.col.*`, `audit.cta.*`, `audit.badge.*` etc. — workflow audit section in `calculator.html`
- `proc.*` — 3-step process section
- `contact.*`, `nl.*` — contact form and newsletter

---

## Currency System (`currency.js`)

IP detection via `ipapi.co/json/` → maps CH → CHF, EU countries → EUR, else USD. Stored in `localStorage` under `gk_currency`.

**Price elements** use `data-price-usd` with the USD base value. The script converts and updates `textContent` on load and on manual switch:

```html
<span data-price-usd="1056">CHF 950</span>
```

**Public API:** `window.GK_setCurrency('EUR')` forces a currency switch.

**Calculator prices** are handled separately via `CALC_AUDIT_EQUIVALENTS` constants inside `calculator.html` (not `data-price-usd`), because the calculator uses formatted strings like `"CHF 950"` directly in JS logic.

---

## Calculator Page (`calculator.html`)

Two-section interactive tool at `/calculator`.

### Section 1 — Time & Cost Leak Calculator

Inputs: currency, employees, average salary, weekly hours per person for comms/admin/ops.

Key constants:
```js
const CALC_SALARY_DEFAULTS   = { CHF: 80000, EUR: 60000, USD: 65000 };
const CALC_AUDIT_EQUIVALENTS = { CHF: "CHF 950", EUR: "EUR 980", USD: "USD 1,050" };
const CALC_AUDIT_PRICE_CHF   = 950;
```

Annual cost formula: `(comm + admin + ops) hours/week × employees × 52 weeks × hourly rate`
where `hourly rate = annual salary / 2000`.

Recoverable savings: `estimatedAnnualCost × 0.2` (20% reduction assumption).

Payoff line: shows `{n}× the cost of the review` where `n = Math.round(recoverableSavings / 950)`. **Not weeks-to-payback** — that framing was removed because the BSR only identifies savings, it doesn't deliver them. Only shown when `savingsMultiple >= 1`.

### Section 2 — Workflow Audit

Appears (via `showWfAudit(true)`) once the annual cost estimate is > 0. Wrapped in an IIFE exposed via `window.showWfAudit`, `window.updateWfAudit`, `window.setupWfAudit`.

Per-workflow cost: `(freq/week × mins / 60) × (salary / 2000) × 52`

Priority badge thresholds:
- ≥ CHF 10,000/yr → **High priority** (gold badge, `#c9a84c`)
- CHF 3,000–9,999/yr → **Review** (teal badge, `#1a6b7a`)
- < CHF 3,000/yr → no badge

Max 8 workflow rows. First row has no remove button.

Two-state CTA:
- No complete rows → "Book your free 30-minute call"
- ≥ 1 complete row → "Book your call — bring these results"

All strings in the workflow audit section come from `i18nText()` with `audit.*` keys.

---

## Styling

No CSS framework. Design tokens (CSS custom properties):
- `--ink` `#0a0a0f` — dark text
- `--paper` `#f4f1ec` — off-white background
- `--gold` `#c9a84c` — primary accent
- `--gold-light` `#e8c97a` — lighter gold
- `--teal` `#1a6b7a` — secondary accent
- `--teal-deep` `#0d3d47` — deeper teal
- `--white` `#ffffff`
- `--muted`, `--glass` — supporting tones

Shared tokens defined in `styles.css`. Per-page styles embedded in `<head>`. Responsive breakpoints at `640px` (mobile) and `768px` (tablet) used throughout.

---

## Third-Party Integrations

- **Google Analytics** (`G-J1Z1TC3H4R`) — gated behind cookie consent; uses Consent Mode v2
- **GoHighLevel/FEA Create** — booking calendar (`link.gamperklimmek.com`), CRM tracking, email automation; also consent-gated
- **Newsletter/form submissions** — `fetch` POST with `mode: 'no-cors'` to FEA Create webhook endpoints
- **ipapi.co** — IP geolocation for currency auto-detection (unauthenticated, free tier)

---

## Cookie Consent

`cookie-consent.js` manages GDPR/Swiss nDSG compliance. Analytics and FEA Create tracking only activate after explicit user consent. Consent state stored in `localStorage`. Users can reopen the modal via `window.GK_openCookieSettings()` (linked in footer).

---

---

# Lucen Agent Team

A multi-agent AI system serving Gamper Klimmek Consulting. Matthias and Jessica interact with the team via a web UI (`lucen-agent-ui`). The orchestrator decomposes requests and delegates to specialist agents. All state lives in Supabase.

**UI:** `localhost:5173` (dev) — `agent team/lucen-agent-ui/`
**Backend:** Supabase project `gsnmkgtwzxtshezwcaan` (eu-central-1)
**Lead scraper:** local Node.js at `http://localhost:3456` — `~/Downloads/lead-scraper/`

---

## Architecture

```
User (Chat UI)
    │  POST { message, user_id, conversation_id }
    ▼
orchestrator (Edge Function v11)
    │  fetches memories → injects company context + learnings
    │  calls Claude Opus with invoke_agent tool
    ▼
agent-invoke (Edge Function v9)   ←── called per specialist agent task
    │  loads agent system_prompt from agents table
    │  calls Claude Sonnet
    │  saves activity to agent_activity
    ▼
specialist agents (brand, outreach, intel, fin, devlead, design, frontend, backend)
    │  may emit MEMORY[...] blocks → orchestrator writes to memories table
    │  brand/outreach responses → saved to content_queue
    │  intel responses with {"action":"lead_scraper",...} → tool-lead-scraper
    ▼
tool-lead-scraper (Edge Function v1)
    │  inserts job into scraper_jobs table
    │  polls for completion (110s timeout)
    ▼
scraper-bridge.js (local Node.js, must be running)
    │  polls scraper_jobs for pending jobs every 5s
    │  calls localhost:3456 (Google Places API)
    │  imports results to prospects table
```

---

## Supabase Tables

| Table | Purpose |
|---|---|
| `agents` | Agent definitions: `code_name`, `display_name`, `model`, `system_prompt` |
| `agent_activity` | Every task invocation: status, task_full, response_text, tokens_used, duration_ms |
| `conversations` | Conversation records: user_id, channel, summary, agents_involved |
| `memories` | Company facts (namespace=company) + agent learnings (namespace=agent.learnings.type) |
| `content_queue` | Content drafts from brand/outreach agents awaiting approval |
| `prospects` | Lead database: company_name, phone, website, sector, city, address, rating, google_place_id |
| `scraper_jobs` | Bridge job queue: keyword, cities, status (pending/running/done/error), results JSONB |
| `financial_records` | Invoice and expense records (managed by fin agent) |
| `projects` | Internal project tracking |

---

## Edge Functions

### Deployment — CRITICAL: `verify_jwt` settings

**When deploying Edge Functions via the Supabase MCP `deploy_edge_function` tool, you MUST set `verify_jwt` correctly:**

| Function | `verify_jwt` | Reason |
|---|---|---|
| `orchestrator` | **`false`** | Called from browser with user JWT — gateway JWT verification rejects valid tokens. Function uses service role key internally. |
| `agent-invoke` | **`false`** | Called server-to-server by orchestrator with service role key. |
| `tool-lead-scraper` | **`false`** | Called server-to-server by orchestrator with service role key. |
| `memory-write` | `true` | Called from authenticated clients — keep JWT verification. |

**Why this matters:** Supabase's default is `verify_jwt: true`. If you deploy without explicitly setting `verify_jwt: false` for the functions above, the gateway will return **401 Unauthorized** on every request — even with a valid, freshly-signed-in session. This has caused repeated outages (v11, v17, v18 all broke due to this). The 401 happens at the gateway level (~50ms) before the function code even runs.

### `orchestrator` (v19) — entry point
- **URL:** `POST /functions/v1/orchestrator`
- **Auth:** `verify_jwt: false` — function uses service role key internally for all DB operations
- **Input:** `{ message, user_id, channel, conversation_id?, attachments? }`
- **Output:** `{ response, conversation_id, agents_involved }`
- **Timeout:** Internal 120s guard stops agent loop before Supabase's hard 150s limit. Skipped agents get a "continue in follow-up" message.
- **What it does:**
  1. Fetches conversation history from `messages` table (last 20 messages)
  2. Fetches memories (company facts + agent learnings) from `memories` table
  3. Injects memory context into orchestrator system prompt
  4. Calls Claude Opus with `invoke_agent` tool — loops until `stop_reason !== 'tool_use'`
  5. For each `invoke_agent` call: fetches agent-specific memories, prepends to task, calls `agent-invoke`
  6. For intel agent: detects `{"action":"lead_scraper",...}` JSON blocks, calls `tool-lead-scraper`, re-invokes intel with results for summary
  7. **ALL agent outputs (>100 chars) → `content_queue`** with `status='pending_review'`, tagged with `content_type` per agent and `metadata: { agent, task, conversation_id }`
  8. After every agent response: scans for `MEMORY[...]...END_MEMORY` blocks and writes to `memories` table
  9. Persists user and assistant messages to `messages` table
  10. Returns synthesised final response

### `agent-invoke` (v9) — specialist agent runner
- **Input:** `{ agent_code, task, task_full?, conversation_id, assigned_by? }`
- **Output:** `{ response, agent_uuid }`
- Loads `system_prompt` from `agents` table by `code_name`
- Calls Claude Sonnet-4-6
- Saves to `agent_activity`: status=running → done/error, tokens_used, duration_ms, response_text

### `tool-lead-scraper` (v1) — scraper bridge adapter
- **Input:** `{ keyword, cities, radius, conversation_id, timeout_ms }`
- Inserts job into `scraper_jobs` with `status='pending'`
- Polls every 3s up to 110s for completion
- Returns 200 with results or 202 if bridge hasn't responded yet (job_id in body)

### `memory-write` (v5) — direct memory write endpoint
- Accepts authenticated writes to `memories` table (used for human corrections)

---

## Specialist Agents

| code_name | Label | Model | Role |
|---|---|---|---|
| `orchestrator` | Orchestrator | claude-opus-4-6 | Routes requests, synthesises multi-agent output |
| `intel` | Research | claude-sonnet-4-6 | Market research, prospect intelligence, lead scraping |
| `brand` | CMO | claude-sonnet-4-6 | Social media content, brand voice, content calendar |
| `outreach` | Sales | claude-sonnet-4-6 | Cold email/DM drafts, prospect enrichment, pipeline |
| `fin` | CFO | claude-sonnet-4-6 | Cash flow, invoicing, financial forecasting |
| `devlead` | Dev Lead | claude-sonnet-4-6 | Technical scoping, architecture, task coordination |
| `design` | UI/UX | claude-sonnet-4-6 | Wireframes, user flows, component specs |
| `frontend` | Frontend | claude-sonnet-4-6 | HTML/CSS/JS, Vercel, gamperklimmek.com edits |
| `backend` | Backend | claude-sonnet-4-6 | Supabase, Edge Functions, automations, integrations |

System prompts are stored in the `agents` table (not in code) — edit them via SQL or a Supabase dashboard query. All system prompts end with the Memory System section explaining the MEMORY block format.

---

## Memory System

Two memory types in the `memories` table:

**`fact` / namespace `company`** — static company knowledge (pricing, ICP, brand voice, tech stack). Seeded once, updated manually. Always injected into every agent's context.

**`learning` / namespace `{agent}.learnings.{type}`** — discovered patterns written by agents after tasks. Types: `win`, `fail`, `pattern`, `discovery`, `process`, `correction`. Confidence: `low` → `medium` → `high`.

### How learnings are written
Agents append `MEMORY[...]...END_MEMORY` blocks to their responses. The orchestrator extracts these after each task and writes them to the `memories` table. Example:

```
MEMORY[type=discovery, confidence=low, applies_to=insurance]
Google Places returns ~20% captive agents (State Farm, Allstate) in insurance searches — filter before using as cold call leads.
END_MEMORY
```

### How memories are read
At conversation start, the orchestrator queries:
- All company facts (always)
- Agent-specific learnings with `confidence IN ('medium', 'high')` and `stale != true`

These are prepended to each agent's task as `## Company Context` and `## Team Learnings (apply these)`.

### Human corrections
Write directly to `memories` with `memory_type='learning'`, `metadata->>confidence='high'`, `metadata->>learning_type='correction'`. These never decay and always override observed learnings.

---

## Content Queue Workflow

1. **Every agent** (not just brand/outreach) with a response > 100 chars saves to `content_queue` with `status='pending_review'`
2. Orchestrator tags each insert with `content_type` per agent (`social_post`, `email`, `dm`, `research`, `financial`, `plan`, `design`, `code`), `platform` (brand only), and `metadata: { agent, task, conversation_id }`
3. Matthias/Jessica reviews in the **Output Queue** tab of the UI
4. **Approve** → status set to `approved`
5. **Redirect** → adds rework instructions, status set to `rejected`, orchestrator re-invokes the agent with instructions
6. **Dismiss** → status set to `rejected`

For CMO/brand content: the Queue UI parses multi-day content calendars into individual post accordion cards (split on `Day N` / weekday markers).

`content_queue` columns: `id`, `content_type`, `platform` (nullable), `pillar`, `title`, `body`, `status`, `metadata` (JSONB).

---

## Lead Scraper

A two-part system: a local Express server (`server.js`) that calls Google Places API, and a bridge (`scraper-bridge.js`) that connects it to Supabase.

### Running locally (both required)
```bash
# Terminal 1 — scraper server
cd ~/Downloads/lead-scraper && node server.js
# → Listening on http://localhost:3456

# Terminal 2 — Supabase bridge
cd ~/Downloads/lead-scraper && node scraper-bridge.js
# → Watching for agent scraper jobs...
```

### How agents trigger the scraper
Intel agent includes a JSON action block in its response:
```json
{"action":"lead_scraper","keyword":"independent insurance agency","cities":["Chicago","Naperville"],"radius":25000}
```
The orchestrator detects this, calls `tool-lead-scraper`, waits up to 110s, then re-invokes the intel agent with results.

### Bridge behaviour
- On startup: resets any jobs stuck in `running` status for >3 minutes back to `pending` (crash recovery)
- Polls `scraper_jobs` every 5s for `status='pending'` jobs
- Geocodes cities, paginates Google Places (up to 3 pages × 20 = 60 results per city)
- Fetches place details (phone, website, rating)
- Deduplicates by `google_place_id` before importing to `prospects`
- Maps keyword to valid `sector` value via `keywordToSector()`

### Valid `sector` values for prospects
`insurance`, `tourism`, `dive`, `surf`, `medspa`, `mortgage`, `other`

---

## UI (`lucen-agent-ui`)

React + Vite + TypeScript + Tailwind CSS. Located at `agent team/lucen-agent-ui/`.

```bash
cd "agent team/lucen-agent-ui"
npm run dev   # → localhost:5173
```

### Pages / Views

| View | File | Description |
|---|---|---|
| Chat | `Chat.tsx` | Main conversation interface. Sends to orchestrator, displays markdown responses. |
| Live | `Live.tsx` | Real-time agent activity feed. Sorted newest-first. Archive button on each task. Agent roster with model names and live status. |
| Approval Queue | `Queue.tsx` | Reviews content_queue items. Approve / Reject & Rework / Reject buttons. Rework sends instructions back to orchestrator. |
| Prospects | `Prospects.tsx` | Lead database table. Search, filter by sector/city, sort columns, checkboxes, CSV export. |

### Key lib files
- `src/lib/supabase.ts` — Supabase client + `orchestratorUrl` + `supabaseAnonKeyExport` exports
- Supabase Realtime used in Live view for live task updates

### How Chat.tsx calls the orchestrator
Chat.tsx uses **raw `fetch`** (not `supabase.functions.invoke`) to call the orchestrator. This gives full control over headers and proper HTTP status code detection. Required headers: `Authorization: Bearer <jwt>`, `apikey: <anon_key>`, `Content-Type: application/json`. The anon key is imported as `supabaseAnonKeyExport` from `supabase.ts`.

Before each call, Chat.tsx refreshes the session via `supabase.auth.refreshSession()` and extracts the access token explicitly.

Error handling distinguishes 401 (auth — "sign out and back in"), 504 (timeout — "break into smaller requests"), and other errors.

### Archive (Live view)
Archived task IDs stored in `localStorage` under key `lucen_archived_activity_ids`. Not persisted to DB.

### Live view
Paginated at 3 messages per page with Prev/Next controls. Kanban board below with 4 columns: In Progress (gold), Done (emerald), Error (red), Archived (muted).

---

## Common Operations

### Check what agents have learned
```sql
SELECT namespace, content, metadata->>'confidence' as confidence, created_at
FROM memories WHERE memory_type = 'learning'
ORDER BY created_at DESC;
```

### Reset a stuck scraper job
```sql
UPDATE scraper_jobs SET status = 'error', error_message = 'manually reset', completed_at = NOW()
WHERE status IN ('pending', 'running') AND id = '<job-id>';
```

### Fix a stuck agent task
```sql
UPDATE agent_activity SET status = 'error', completed_at = NOW()
WHERE status = 'running' AND started_at < NOW() - INTERVAL '10 minutes';
```

### Edit an agent's system prompt
```sql
UPDATE agents SET system_prompt = '...' WHERE code_name = 'intel';
```

### Manually add a high-confidence correction memory
```sql
INSERT INTO memories (memory_type, namespace, content, metadata)
VALUES (
  'learning', 'outreach.learnings.correction',
  'Always address cold emails to the agency owner by first name — never "Dear Sir/Madam".',
  '{"learning_type":"correction","confidence":"high","applies_to":"outreach","created_by":"matthias","times_validated":0}'
);
```

### View approval queue backlog
```sql
SELECT id, content_type, platform, pillar, LEFT(title,80) as title, status, created_at
FROM content_queue WHERE status = 'pending_review' ORDER BY created_at DESC;
```
