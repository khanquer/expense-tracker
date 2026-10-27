# Expense Tracker

A personal expense and price tracker for Android, built as an installable web app (PWA).

- **Add expenses** from a Swiggy/Zomato/Instamart screenshot, a photo of a receipt, a quick note ("auto to office 120"), or by hand. Gemini reads images and notes into line items; you check them before saving.
- **Category split over time**: week / month / year, with a trend chart.
- **Price comparison**: every item is linked to a product (e.g. "Toned milk") and priced per kg, litre or piece, so you can see which shop or pack size is cheapest. Optionally include delivery fees and discounts.
- **Learns from corrections**: a bill line seen before maps to the same product and category next time.

All data stays on the phone (IndexedDB). There is no server. The Gemini key is stored on the device and sent only to Google's API.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # production build in dist/
```

`node scripts/make-icons.mjs` regenerates the app icons.

## Put it on your phone

Installing the app and receiving screenshots from the share sheet both need HTTPS, so host the `dist/` folder on any static host. It's only static files; your data and key never leave the phone. Any of these work:

- **Netlify Drop**: run `npm run build`, then drag the `dist` folder onto https://app.netlify.com/drop.
- **GitHub Pages / Cloudflare Pages**: push the repo and deploy `dist/`. The build uses relative paths, so a sub-path such as `/expense-tracker/` works.

Then on the phone:

1. Open the URL in Chrome → ⋮ → **Add to Home screen / Install app**.
2. Open **Settings**, paste a free Gemini API key from https://aistudio.google.com/apikey, and tap **Save key**.
3. Take a screenshot of an order → **Share** → **Expenses**.

Back up from Settings now and then. Clearing Chrome's site data or losing the phone loses everything else.

## How it fits together

| Path | What |
|---|---|
| `src/db.ts` | Dexie (IndexedDB) schema: expenses, items, products, aliases, categories, images, settings |
| `src/lib/gemini.ts` | Gemini `generateContent` call with a JSON response schema; maps the result to a draft |
| `src/lib/draft.ts` | Draft model, total check, fee allocation, saving, and product learning |
| `src/lib/units.ts`, `prices.ts` | Unit normalization (g/kg/ml/L/pc/dozen) and per-product price stats |
| `src/sw.ts` | Service worker: offline cache and Android share-target handler |
| `src/screens/` | Home (dashboard), History, Add, EditExpense, Prices, ProductDetail, Settings |

Each item stores `price` (as billed) and `effective` (its proportional share of the bill total, including fees and discounts). Category totals use `effective`, so they add up to what you actually paid.
