# CLAUDE.md

Cheatsheet + pointers for Claude when working in this repository. Detail lives in topical docs.

## What this is

Two-system project for **Gamper Klimmek Consulting**, an AI & automation consulting firm targeting owner-operated SMBs:

1. **Marketing site** — static HTML at `https://www.gamperklimmek.com`, no build step, Vercel-deployed.
2. **Lucen Agent Team** — multi-agent backend on Supabase (project `gsnmkgtwzxtshezwcaan`, eu-central-1) with a React UI at `agent team/lucen-agent-ui/`.

## Documentation Index

| File | When to read it |
|---|---|
| `SITE.md` | Marketing site reference — i18n, currency, calculator, styling, third-party, cookies |
| `BACKEND.md` | Agent team reference — architecture, tables, edge functions, agents, memory, content queue, lead scraper, UI, common SQL |
| `README.md` | Top-level repo readme |

---

## Load-bearing constraints (NEVER violate)

### Service & Pricing

Three fixed-scope offerings. These prices appear throughout the site — keep them consistent everywhere:

| Service | CHF | EUR | USD |
|---|---|---|---|
| Free 30-minute consultation | — | — | — |
| Business Systems Review (BSR) | 950 | 980 | 1,050 |
| Implementation Sprint | 3,500 | 3,610 | 3,889 |

EUR/USD amounts are computed via `currency.js` from `data-price-usd` base values. The CHF price is always the reference.

**Never write "Website & Workflow Review" or any other name — the product is called Business Systems Review.**

### Edge Function `verify_jwt` settings

**When deploying Edge Functions via the Supabase MCP `deploy_edge_function` tool, you MUST set `verify_jwt` correctly:**

| Function | `verify_jwt` | Reason |
|---|---|---|
| `orchestrator` | **`false`** | Called from browser with user JWT — gateway JWT verification rejects valid tokens. Function uses service role key internally. |
| `agent-invoke` | **`false`** | Called server-to-server by orchestrator with service role key. |
| `tool-lead-scraper` | **`false`** | Called server-to-server by orchestrator with service role key. |
| `memory-write` | `true` | Called from authenticated clients — keep JWT verification. |

Supabase's default is `verify_jwt: true`. If you deploy without explicitly setting `verify_jwt: false` for the functions above, the gateway will return **401 Unauthorized** on every request — even with a valid, freshly-signed-in session. This has caused repeated outages (v11, v17, v18 all broke due to this). The 401 happens at the gateway level (~50ms) before the function code even runs.

### Caching

Static assets (`.js`, `.css`, images) are cached for 1 year (`immutable`) by Vercel. HTML files are `no-cache`. When updating shared files like `i18n.js` or `currency.js`, any in-flight visitors will keep the old cached version until their cache expires — no explicit cache-busting mechanism exists.

---

## Development

**Marketing site:** no build step. Edit files directly and open in a browser to test. Most features work from `file://` — the only exception is `api/submit-case-study.js` (serverless, requires Vercel or a local Node environment). Vercel auto-deploys on push to `main`. Clean URLs are enabled (`/calculator` serves `calculator.html`, etc.).

**Agent UI:** `cd "agent team/lucen-agent-ui" && npm run dev` → `localhost:5173`.

**Lead scraper:** runs locally at `~/Downloads/lead-scraper/`. Two terminals needed (server + bridge) — see `BACKEND.md`.

---

## Specialist Agents (quick list)

Full table with models + roles lives in `BACKEND.md`.

`orchestrator` (Opus) · `intel` · `brand` · `outreach` · `fin` · `devlead` · `design` · `frontend` · `backend`. All specialists run Claude Sonnet-4-6.
