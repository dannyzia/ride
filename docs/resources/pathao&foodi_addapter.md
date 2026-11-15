# MULTI-PLATFORM EXTENSION SPEC: Pathao Food & Foodi Adapters (v3.0)

Extend the existing Foodpanda Extractor into a Unified Multi-Platform Menu Extractor (`bd-food-extractor`) supporting **Foodpanda** (`foodpanda.com.bd`), **Pathao Food** (`food.pathao.com`), and **Foodi** (`foodibd.com`).

---

## 1. Updated Architecture (Strategy / Adapter Pattern)

Refactor `src/extractors/` into platform-specific adapters that all return the unified `ExtractedCatalog` interface defined in `src/types/normalized.types.ts`:

```text
src/
├── adapters/
│   ├── base.adapter.ts          # Abstract class: extract(url): Promise<ExtractedCatalog>
│   ├── foodpanda.adapter.ts     # Existing v2.0 3-tier Delivery Hero logic
│   ├── pathao.adapter.ts        # Pathao Food SSR/HTML + REST API adapter
│   └── foodi.adapter.ts         # Foodi Playwright XHR Interceptor + Partner API adapter
├── router/
│   └── platformRouter.ts        # Detects platform from URL hostname & dispatches adapter
```

---

## 2. Platform Router (`src/router/platformRouter.ts`)

Inspect the input URL hostname and route automatically:
- `*.foodpanda.*` -> `FoodpandaAdapter`
- `food.pathao.com` -> `PathaoAdapter`
- `*.foodibd.com` -> `FoodiAdapter`

---

## 3. Pathao Food Adapter (`src/adapters/pathao.adapter.ts`)

Target URL format: `https://food.pathao.com/restaurants/{vendor_code}/{slug}`

### Tier 1: Direct HTML / SSR State Extraction (`got-scraping` + `cheerio`)
1. Fetch the target URL with `got-scraping` using Bangladesh locale headers.
2. Check for embedded state scripts (`__NEXT_DATA__` or `window.__INITIAL_STATE__`). If present, extract the structured restaurant object, categories, and items directly.
3. **Structured DOM Parser Fallback (if state script is absent):**
   Pathao Food server-renders the complete menu cleanly in the DOM:
   - Extract Restaurant Name (`h1`), Address, and Cuisines from the header banner.
   - Iterate through each Category container section:
     - Extract Category Name heading.
     - For each Item card inside the section:
       - Extract Item Name, Description/Sub-label (e.g., `"4 Pcs/ 8 Pcs"` or `"Served with Egg Fried Rice..."`), and Image URL (`img[src]`).
       - Parse Price string (e.g., `"৳340.00"`) by stripping `"৳"` and commas into a `float`.

### Tier 2: Pathao Internal API Interception (`playwright-extra`)
If modifiers/variants are required or Tier 1 fails:
1. Launch stealth Playwright and intercept JSON responses matching `*/restaurants/{vendor_code}*` or `*/menu*`.
2. Normalize Pathao's category/item JSON into `ExtractedCatalog`.

---

## 4. Foodi Adapter (`src/adapters/foodi.adapter.ts`)

Foodi requires either authenticated Partner Gateway API access or dynamic SPA network interception. Implement both modes:

### Mode A: Official Partner Gateway API (If `FOODI_CLIENT_ID` & `FOODI_CLIENT_SECRET` env vars exist)
1. Authenticate via `POST https://integration.foodibd.com/api/v1/partners/login` with `{ clientId, clientSecret }` to obtain a Bearer JWT.
2. Call the Catalog Management endpoint (`GET /api/v1/catalog` or equivalent list endpoint) and map directly to `ExtractedCatalog`.

### Mode B: Unauthenticated Consumer SPA Scraper (Playwright Network Interception)
1. Launch `playwright-extra` with geolocation permissions granted and pre-seeded to Dhaka (`latitude: 23.8103, longitude: 90.4125`) so Foodi doesn't block menu rendering behind an address modal.
2. Attach a `page.on('response')` listener capturing JSON responses from `foodibd.com` API subdomains containing `categories`, `products`, or `menu` keys.
3. Navigate to the restaurant URL, wait for network idle, capture the catalog JSON payload, and normalize into `ExtractedCatalog`.

---

## 5. Unified Output Guarantee
Regardless of whether the input URL is from Foodpanda, Pathao Food, or Foodi:
1. Output the exact same `ExtractedCatalog` JSON structure and flattened POS CSV schema.
2. Stamp `metadata.platform` as `'foodpanda' | 'pathao' | 'foodi'`.