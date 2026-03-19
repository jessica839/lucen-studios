---
name: gamperklimmek-website
description: Edit and maintain the Gamper Klimmek Consulting static website — copy changes, i18n updates, calculator logic, currency handling, and email templates.
---

# Gamper Klimmek Website Skill

Instructions for making changes to the Gamper Klimmek Consulting website (`https://www.gamperklimmek.com`).

## When to use

Use this skill when asked to:
- Edit copy, headlines, or CTAs on any page
- Add or update translations in `i18n.js`
- Modify calculator logic or thresholds in `calculator.html`
- Update pricing (CHF / EUR / USD) across the site
- Edit or create email templates
- Add new pages or sections
- Adjust styling or design tokens

## Key constraints

- **No build step.** Plain HTML/CSS/JS. Edit files directly.
- **Pricing is the source of truth in CLAUDE.md.** Never change prices without updating all occurrences: `i18n.js`, `calculator.html` (`CALC_AUDIT_EQUIVALENTS`, `CALC_AUDIT_PRICE_CHF`), and any hardcoded `data-price-usd` attributes in HTML.
- **Product name:** Always "Business Systems Review" (BSR). Never "Website & Workflow Review" or any other variant.
- **i18n is mandatory.** Every user-facing string must exist in all 5 languages: `en`, `de`, `fr`, `es`, `it` in `i18n.js`. Static HTML uses `data-i18n="key"`. Dynamic JS uses `i18nText(key, fallback)`.
- **Currency:** Static price elements use `data-price-usd` with the USD value. CHF is always the reference currency. Calculator prices are separate constants in `calculator.html`.

## Instructions

### Editing copy

1. Find the relevant `data-i18n` key in the HTML element.
2. Update all 5 language entries for that key in `i18n.js`.
3. If adding a new string, add a new key to all 5 language blocks and add `data-i18n="your.key"` to the HTML (or `i18nText("your.key", "English fallback")` in JS).

### Updating prices

1. Update the pricing table in `CLAUDE.md`.
2. In `calculator.html`: update `CALC_AUDIT_EQUIVALENTS` and `CALC_AUDIT_PRICE_CHF`.
3. In `i18n.js`: search for old price strings (e.g. `950`) and update all 5 language blocks.
4. In HTML files: update `data-price-usd` attributes and any visible price text.

### Adding a new page

1. Create `pagename.html` — embed page-specific CSS in `<head>`, link `i18n.js` and `currency.js`.
2. No routing config needed — Vercel clean URLs handle it automatically.
3. Add to `sitemap.xml`.

### Email templates

Templates follow the pattern `email-{event}.{lang}.html` where event is `appointment-confirmed`, `appointment-reminder`, or `appointment-requested`, and lang is `en`, `de`, `fr`, `es`, `it` (plus a base `.html` as EN fallback). Edit all relevant language variants when changing template structure.

### Serverless API (`api/submit-case-study.js`)

Accepts POST with `{ firstName, email, company, cases }` where `cases` is `["cs1"]`, `["cs2"]`, `["cs3"]` or any combination. Creates/upserts a GHL contact and enrolls them in mapped workflows. Requires `GHL_API_KEY` env var in Vercel project settings.
