# LabelGuard — Compliance Scanner

Prototype for SIH 2026, PS #26034 (Team Vision X). Scans a package label image and
checks it against the Legal Metrology declarations required for the selected
product category.

## Structure

```
labelguard/
├── index.html      # markup only
├── style.css       # all styling
├── app.js          # all application logic (OCR, extraction, verdict)
├── rules.json      # the rule database — edit this, not the code
└── README.md
```

**`rules.json` is the rule database**, kept separate from the code on purpose —
so the team member(s) doing legal research can update product categories and
required fields without touching JavaScript. `app.js` just reads whatever is
in this file at runtime (`fetch('rules.json')`).

To add or change a category, edit the `categories` array in `rules.json`:

```json
{
  "id": "new_category",
  "label": "New Category Name",
  "quantityUnit": "g or kg",
  "requiredFields": ["productName", "netQuantity", "mrp", "manufacturer"]
}
```

Field keys must match an entry in `fieldDefinitions` at the top of the file.
Fields marked `"autoCheckable": true` are checked automatically from OCR text
via regex in `app.js`; fields marked `false` (like product name or brand) are
shown as "verify manually" since free-text presence checks aren't reliable.

## How it works

1. User picks a product category (populated from `rules.json`).
2. User uploads a package photo.
3. Tesseract.js runs OCR **entirely in the browser** — no image is ever sent
   to a server.
4. `app.js` runs regex extraction over the OCR text for: net quantity, MRP,
   manufacturer/packer, dates, consumer care, size.
5. Extracted fields are checked against that category's `requiredFields`.
6. Verdict: **PASS**, **FAIL** (lists what's missing), or **REVIEW REQUIRED**
   (when OCR confidence/text is too low to trust).

## Running locally

Because `app.js` fetches `rules.json`, you can't just double-click
`index.html` (browsers block `fetch()` of local files opened via `file://`).
Serve it with any static server:

```bash
cd labelguard
python3 -m http.server 8000
# then open http://localhost:8000
```

or `npx serve .`

## Deploying by Monday

Any static host works, since there's no backend:

- **Netlify Drop**: go to https://app.netlify.com/drop and drag the
  `labelguard` folder in. Gives you a live URL in seconds, no account needed
  for a quick demo (sign up to keep it permanent).
- **GitHub Pages**: push this folder to a repo, enable Pages on the `main`
  branch in Settings → Pages.
- **Vercel**: `npx vercel` from inside the folder.

## Known limitations (be upfront about these in your demo)

- Product **category is manually selected**, not auto-classified — the PPT's
  CNN classifier is future work, not in this prototype.
- Field extraction is **regex-based**, not true NLP/NER — works well on clear,
  well-lit label photos; struggles with curved surfaces, glare, or small text.
- No font-size/legibility measurement (the research doc flags that this needs
  physical calibration, not just pixels — out of scope for this prototype).
- No persistence/history/dashboard yet — each scan is a single session.
