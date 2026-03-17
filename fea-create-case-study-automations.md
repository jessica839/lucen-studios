# FEA Create — Case Study Email Automations

Three separate automations, one per case study form. Each automation is triggered by the corresponding form submission and sends a single email with the matching PDF.

---

## Shared setup (applies to all three)

**Form field mapping** — all three forms send these fields:

| Field name in form | Use in automation |
|---|---|
| `first_name` | Personalise email greeting |
| `email` | Send to |
| `company` | Optional — include in email if present |
| `language` | Optional — use for conditional logic if you want multilingual emails |
| `selected_case` | Not needed (each form is already specific) |

---

## Automation 1 — Case Study: Lead Qualification

**Trigger:** Form `BRGYgJnPbOnPtOt8Wc7X` submitted

**Workflow name:** `CS1 — Lead Qualification Delivery`

**Step 1: Send email immediately**

- **To:** `{{contact.email}}`
- **Subject:** `Your case study: 300 Companies. Under an Hour.`
- **From name:** `Matthias at Gamper Klimmek`
- **Reply-to:** `hello@gamperklimmek.com`

**Email body (plain text or HTML):**

```
Hi {{contact.first_name}},

Here's the case study you requested — how we used AI to qualify a full tradeshow exhibitor list and walked in knowing exactly who to talk to before the doors opened.

→ Download your case study (PDF):
https://assets.cdn.filesafe.space/TVnVIKtzPOvL3AU4elns/media/69b0832f4f84ffd5a5b40afc.pdf

If you have questions or want to explore what this could look like for your business, just reply to this email.

Matthias Klimmek
Gamper Klimmek Consulting
https://www.gamperklimmek.com
```

**Tags to add on submission:** `case-study`, `cs1-lead-qualification`

---

## Automation 2 — Case Study: Lead Generation

**Trigger:** Form `4uH80XYluvb0lyvRggti` submitted

**Workflow name:** `CS2 — Lead Generation Delivery`

**Step 1: Send email immediately**

- **To:** `{{contact.email}}`
- **Subject:** `Your case study: One Week of Research. Done in 15 Minutes.`
- **From name:** `Matthias at Gamper Klimmek`
- **Reply-to:** `hello@gamperklimmek.com`

**Email body:**

```
Hi {{contact.first_name}},

Here's the case study you requested — how we built a no-code AI lead scraper that generated 500+ qualified contacts in the diving industry in under 15 minutes.

→ Download your case study (PDF):
https://assets.cdn.filesafe.space/TVnVIKtzPOvL3AU4elns/media/69b0831a7fc07c1cfa655265.pdf

If you have questions or want to explore what this could look like for your business, just reply to this email.

Matthias Klimmek
Gamper Klimmek Consulting
https://www.gamperklimmek.com
```

**Tags to add on submission:** `case-study`, `cs2-lead-generation`

---

## Automation 3 — Case Study: Customer Automation

**Trigger:** Form `coiWdRzKwWh7f13r3PF2` submitted

**Workflow name:** `CS3 — Customer Automation Delivery`

**Step 1: Send email immediately**

- **To:** `{{contact.email}}`
- **Subject:** `Your case study: A Full-Time Customer Assistant. Built in 3 Hours.`
- **From name:** `Matthias at Gamper Klimmek`
- **Reply-to:** `hello@gamperklimmek.com`

**Email body:**

```
Hi {{contact.first_name}},

Here's the case study you requested — how we built a multilingual chatbot that handles recurring customer questions around the clock without adding headcount.

→ Download your case study (PDF):
https://assets.cdn.filesafe.space/TVnVIKtzPOvL3AU4elns/media/69afed798d3eae1d10cf3c19.pdf

If you have questions or want to explore what this could look like for your business, just reply to this email.

Matthias Klimmek
Gamper Klimmek Consulting
https://www.gamperklimmek.com
```

**Tags to add on submission:** `case-study`, `cs3-customer-automation`

---

## How to set up each automation in FEA Create

1. Go to **Automations → Create Workflow**
2. Set trigger: **Form Submitted** → select the form ID above
3. Add action: **Send Email**
4. Paste the subject and body above, using `{{contact.first_name}}` and `{{contact.email}}` as merge tags
5. Set **Send immediately** (no delay)
6. Add a **Add Tag** action after the email step with the tags listed above
7. **Save & Publish**

Repeat for all three workflows.

---

## Testing checklist

- [ ] Submit each form with a test email address
- [ ] Confirm email arrives within 60 seconds
- [ ] Confirm the PDF link opens correctly
- [ ] Confirm the contact appears in FEA Create with the correct tags
- [ ] Confirm the form confirmation message appears on the homepage after submit

---

## Note on multi-selection

When a visitor selects more than one case study, the website submits **one request per selected case** to the respective form endpoints. This means a visitor who selects all three will receive three separate emails (one per case study). Each automation fires independently — no additional configuration needed.
