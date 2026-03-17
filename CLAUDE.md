# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML website for **Gamper Klimmek Consulting**, an AI & automation consulting firm targeting owner-operated SMBs. No build system, no package manager — plain HTML, CSS, and vanilla JavaScript deployed on Vercel.

**Live site:** `https://www.gamperklimmek.com`

## Development

**No build step required.** Edit files directly and open in a browser to test.

**Deployment:** Vercel auto-deploys on push to `main`. Clean URLs are enabled (`/calculator` serves `calculator.html`, etc.).

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

### Config

- `vercel.json` — deployment config (clean URLs, security headers, 1-hour cache)
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

Stored in `localStorage` under `gk_language`. Default: `en`. Auto-detected from browser on first visit.

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
