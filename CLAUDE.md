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

What the pages state (verified 2026-11-17; introduced 2026-06-13 in `80ede1e`/`7da2f96`). Keep them consistent everywhere:

| Service | CHF | EUR | USD |
|---|---|---|---|
| Free consultation (30 min) | free | free | free |
| Business Systems Review (BSR), credited toward a Sprint | 950 | 950 | 990 |
| Implementation Sprint | from 2’900 | from 2’900 | from 3’000 |
| Care Plan | from 390/month | | |
| KI-Transparenz-Kit | 99 | | |

The `data-price-*` attributes carry the amounts; `currency.js` formats them (CHF with the Swiss `’` separator). The CHF price is always the reference.

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

`vercel.json` declares a 1-year `immutable` rule for assets, but production serves them with `max-age=0, must-revalidate` (the catch-all rule wins; checked 2026-11-17). Do not "fix" the rule order without adding cache-busting first: `i18n.js`/`currency.js` are referenced without consistent version hashes, so visitors would keep stale scripts for a year.

### Deploy surface (allowlist)

`.vercelignore` is an allowlist: only the listed pages, folders and assets are deployed. Docs (`*.md`), `scripts/`, `package.json`, the `email-appointment-*.html` GHL templates and anything else in the repo stay private. **A new public file or folder must be added to `.vercelignore`**, or it will 404 in production. `scripts/check-deploy-set.mjs` (part of `npm test`) fails when a deployed page references something outside the allowlist or when a doc slips in. The GitHub repo itself is public, so internal documents do not belong in it at all; keep them in the untracked `internal/` folder.

---

## Development

**Marketing site:** no build step for the EN pages. `de/` and `fr/` are generated: edit the root page / `i18n.js` / `scripts/lang-*.json`, then `bun run build:lang` and `bun run test`. `bun run dev` serves the site with clean URLs, the `vercel.json` redirects and the `api/` handlers (set `GHL_API_BASE` to a stub to test forms without touching the CRM). Vercel (project `lucen-studios` in Jess's team `jessica-8829s-projects`) deploys `main`; ship via branch → PR → merge on GitHub when the Vercel check is green.

**Agent UI:** `cd "agent team/lucen-agent-ui" && npm run dev` → `localhost:5173`.

**Lead scraper:** runs locally at `~/Downloads/lead-scraper/`. Two terminals needed (server + bridge) — see `BACKEND.md`.

---

## Specialist Agents (quick list)

Full table with models + roles lives in `BACKEND.md`.

`orchestrator` (Opus) · `intel` · `brand` · `outreach` · `fin` · `devlead` · `design` · `frontend` · `backend`. All specialists run Claude Sonnet-4-6.
