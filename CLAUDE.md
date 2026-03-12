# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Static HTML website for Gamper Klimmek Consulting (lucen-studios), an AI & automation consulting firm. No build system, no package manager — plain HTML, CSS, and vanilla JavaScript deployed on Vercel.

## Development

**No build step required.** Edit files directly and open in a browser to test.

**Deployment:** Vercel auto-deploys on push to `main`. Clean URLs are enabled (`/businesses` serves `businesses.html`).

## Architecture

### File Structure

- `index.html`, `businesses.html`, `operators.html`, `story.html`, `resources.html`, `start.html`, `legal.html` — one HTML file per page, self-contained with embedded CSS
- `i18n.js` — all translations and the i18n runtime (~2,300 lines)
- `cookie-consent.js` — GDPR/Swiss FADP compliant consent banner
- `vercel.json` — deployment config (clean URLs, security headers, 1-hour cache)

### Internationalization

All user-facing text lives in `i18n.js`, structured as:

```js
TRANSLATIONS = {
  common: { en: {...}, de: {...}, fr: {...}, it: {...}, es: {...} },
  pages: {
    index: { en: {...}, de: {...}, ... },
    // one entry per page
  }
}
```

HTML elements use `data-i18n="key"` attributes. The runtime replaces `textContent` via `document.querySelectorAll('[data-i18n="key"]')`. Language preference is stored in `localStorage` under `gk_language`. Default language is English (`en`).

**When editing copy:** update both the HTML `data-i18n` key reference and all 5 language entries (`en`, `de`, `fr`, `it`, `es`) in `i18n.js`.

### Styling

No CSS framework. Styles are embedded in each HTML file's `<head>`. CSS custom properties define the design tokens:
- `--ink`, `--paper`, `--gold`, `--teal`, `--white`, `--muted`, `--glass`

### Third-Party Integrations

- **Google Analytics** (`G-J1Z1TC3H4R`) — gated behind cookie consent; uses Consent Mode v2
- **GoHighLevel/FEA Create** — booking calendar and CRM tracking, also consent-gated
- **Newsletter/form submissions** — `fetch` POST with `mode: 'no-cors'` to FEA Create endpoints

### Cookie Consent

`cookie-consent.js` manages GDPR/Swiss nDSG compliance. Analytics and FEA Create tracking only activate after explicit user consent. Consent state is stored in `localStorage`.
