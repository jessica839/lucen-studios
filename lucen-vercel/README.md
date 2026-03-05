# Lucen Studios — Vercel Deployment

## Files in this folder
- `index.html` — the full website
- `vercel.json` — Vercel configuration

## Deploy in 3 steps

### Step 1 — Create a Vercel account
Go to vercel.com and sign up with GitHub, Google, or email. Free.

### Step 2 — Deploy
Option A (easiest — drag & drop):
1. Go to vercel.com/new
2. Drag this entire folder onto the page
3. Click Deploy
4. Live in ~60 seconds at a vercel.app URL

Option B (via CLI):
```
npm i -g vercel
vercel
```

### Step 3 — Connect your domain
1. In Vercel dashboard → your project → Settings → Domains
2. Add lucenstudios.com
3. Vercel gives you DNS records — add them at your registrar
4. Free, no monthly charge for custom domains

## Connect FEA Create tracking
In index.html, find the <head> tag and paste your FEA Create
tracking script directly after it. Then redeploy by dragging
the folder again.

## Making changes
Edit index.html, then drag the folder to vercel.com/new again.
Vercel keeps all previous versions so you can roll back anytime.

## Embed FEA Create booking calendar
Replace the href="#" on the "Book a free 30-min call" button
with your FEA Create calendar URL.
Search for: href="#" class="ls-cta-btn"
