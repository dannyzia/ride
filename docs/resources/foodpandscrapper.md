# SYSTEM SPECIFICATION: Foodpanda / Delivery Hero Menu Extractor (v2.0)

You are a Senior Backend & Scraping Architect. Build a production-grade, fault-tolerant TypeScript CLI and service module that extracts complete restaurant catalogs from Foodpanda (`foodpanda.com.bd` and global Delivery Hero domains) and normalizes them into structured JSON and POS-ready CSV files.

---

## 1. Project Structure & Stack

Use Node.js (v20+ ESM) and TypeScript:

```text
foodpanda-extractor/
├── package.json
├── tsconfig.json
├── src/
│   ├── config/
│   │   └── regions.ts            # Domain-to-API gateway mappings (bd, my, sg, pk, tw)
│   ├── types/
│   │   ├── raw-dh.types.ts       # Raw Delivery Hero v5 API payload interfaces
│   │   └── normalized.types.ts   # Clean target output interfaces + Zod schemas
│   ├── extractors/
│   │   ├── discoApiExtractor.ts  # Tier 1: Direct [fd-api.com/api/v5/vendors](https://fd-api.com/api/v5/vendors) JSON fetch
│   │   ├── ssrExtractor.ts       # Tier 2: Next.js __NEXT_DATA__ HTML fallback
│   │   └── browserExtractor.ts   # Tier 3: Playwright Stealth network interception
│   ├── parser/
│   │   └── catalogNormalizer.ts  # Relational joiner (variations + toppings dictionary)
│   ├── exporters/
│   │   ├── jsonExporter.ts       # Structured JSON export
│   │   └── csvExporter.ts        # Flattened POS/database import CSV
│   ├── utils/
│   │   ├── urlParser.ts          # Extracts vendor_code & region from Foodpanda URLs
│   │   └── imageUrl.ts           # Sanitizes Delivery Hero image macros
│   └── cli.ts                    # Commander.js CLI entrypoint
```

### Required Dependencies
- **HTTP & TLS Spoofing:** `got-scraping` (spoofs browser JA3/JA4 TLS & HTTP/2 fingerprints)
- **HTML Parsing:** `cheerio`
- **Browser Fallback:** `playwright`, `playwright-extra`, `puppeteer-extra-plugin-stealth`
- **Validation & CLI:** `zod`, `commander`, `csv-writer`, `ora`, `chalk`
- **Dev:** `typescript`, `tsx`, `@types/node`

---

## 2. URL Parsing & Region Mapping (`src/utils/urlParser.ts`)

1. Accept either a full Foodpanda URL (e.g., `https://www.foodpanda.com.bd/restaurant/w2oi/takeout-dhanmondi`) or a raw `vendor_code` (`w2oi`) + country code (`bd`).
2. Extract the 4-character alphanumeric `vendor_code` using regex: `/\/restaurant\/([a-z0-9]+)(?:\/|$)/i`.
3. Map the TLD to Delivery Hero's regional gateway:
   - `.com.bd` -> `https://bd.fd-api.com` (Currency: `BDT`, Lat/Lng default: `23.8103, 90.4125`)
   - `.com.my` -> `https://my.fd-api.com` (Currency: `MYR`)
   - `.sg`     -> `https://sg.fd-api.com` (Currency: `SGD`)
   - `.pk`     -> `https://pk.fd-api.com` (Currency: `PKR`)

---

## 3. Three-Tier Extraction Cascade (`src/extractors/`)

Implement an automatic fallback cascade inside a master orchestrator:

### Tier 1: Direct Delivery Hero Discovery API (`discoApiExtractor.ts`)
Make a GET request using `got-scraping` (configured for Chrome desktop headers + HTTP/2) to:
```http
GET https://{region}[.fd-api.com/api/v5/vendors/](https://.fd-api.com/api/v5/vendors/){vendor_code}?include=menus,bundles,multiple_discounts&language_id=1&opening_type=delivery&basket_currency={currency}&latitude={lat}&longitude={lng}
```
**Mandatory Headers:**
- `x-disco-client-id`: `web`
- `X-FP-API-KEY`: `volcano`
- `Accept`: `application/json, text/plain, */*`
- `Origin`: `https://www.foodpanda.com.bd`
- `Referer`: `https://www.foodpanda.com.bd/`

If status is `200` and `body.data.menus` exists, pass `body.data` directly to the normalizer.

### Tier 2: SSR Hydration Fallback (`ssrExtractor.ts`)
If Tier 1 returns `403`/`429`, fetch the store HTML page using `got-scraping`, parse with `cheerio`, and extract:
1. `<script id="__NEXT_DATA__" type="application/json">`
2. Search recursively in the parsed JSON for the object containing `menus` and `menu_categories` (typically under `props.pageProps.initialMenuState.MenuStoreData.vendor` or `props.pageProps.dehydratedState`).

### Tier 3: Headless Browser Network Interception (`browserExtractor.ts`)
If Cloudflare or PerimeterX blocks Tiers 1 & 2:
1. Launch `playwright-extra` with `StealthPlugin()`.
2. Attach a `page.on('response')` listener BEFORE navigating.
3. Listen for responses matching `/\/api\/v5\/vendors\/[a-z0-9]+/i` with status `200`.
4. Navigate to the restaurant URL (`waitUntil: 'domcontentloaded'`).
5. Capture the intercepted JSON response or evaluate `window.__NEXT_DATA__` from the page context, then cleanly close the browser.

---

## 4. Relational Catalog Normalization (`src/parser/catalogNormalizer.ts`)

**CRITICAL ARCHITECTURE RULE:** Delivery Hero v5 payloads store product variations and modifiers relationally. You MUST implement the join logic below:

### Raw Delivery Hero Payload Structure (`data.menus[0]`):
- `menu.toppings`: A root lookup dictionary `Record<string, RawToppingGroup>` keyed by `id`. Each entry contains:
  - `id`: number
  - `name`: string (e.g., `"Choice of Bun"`, `"Add-ons"`)
  - `quantity_minimum`: number
  - `quantity_maximum`: number
  - `options`: Array of `{ id, name, price, description, is_sold_out }`
- `menu.menu_categories[]`: Array of categories, each containing `products[]`.
- `product`: Each item inside `products[]` contains:
  - `id`, `code`, `name`, `description`, `file_path` (or `logo_path`), `is_sold_out`
  - `product_variations[]`: Array of size/variant objects:
    - `id`, `code`, `name` (e.g., `"Regular"`, `"Large"`, or omitted if single-size)
    - `price`: number (final selling price)
    - `price_before_discount`: number (optional original price)
    - `topping_ids`: `number[]` (Foreign keys pointing to `menu.toppings[id]`)

### Normalization Rules:
1. **Deduplicate Popular Category:** By default, skip or flag the synthetic `"Popular"` category (`code === 'popular'`) via a CLI flag `--include-popular` (default `false`) so items are not duplicated in database imports.
2. **Resolve Variations & Modifiers:**
   - For each product, map `product_variations` into a clean `variations` array.
   - If a product has only 1 variation with no `name`, set `basePrice = variation.price` and attach its resolved `topping_ids` to the item's `modifierGroups`.
   - If a product has multiple named variations (e.g., `"8 Inch"`, `"12 Inch"`), set `basePrice` to the minimum variation price, keep all entries in `variations[]`, and resolve `topping_ids` per variation (or deduplicated at the item level).
   - Resolve every `topping_id` in `variation.topping_ids` by looking up `menu.toppings[String(topping_id)]`.
3. **Image URL Cleaning (`src/utils/imageUrl.ts`):**
   - Product images are stored in `product.file_path` or `product.images[0].image_url`.
   - Replace `?width=%s` or trailing macros with `?width=800&height=800`.
4. **Text Sanitization:**
   - Strip zero-width spaces, normalize whitespace, and decode HTML entities in `name` and `description`.

---

## 5. Target Output Schema (`src/types/normalized.types.ts`)

```typescript
export interface NormalizedModifierOption {
  id: number | string;
  name: string;
  priceDelta: number;
  isAvailable: boolean;
}

export interface NormalizedModifierGroup {
  id: number | string;
  name: string;
  minSelection: number;
  maxSelection: number;
  isRequired: boolean; // true if minSelection > 0
  options: NormalizedModifierOption[];
}

export interface NormalizedVariation {
  id: number | string;
  name: string; // e.g., "Regular", "Large", or "Standard"
  price: number;
  originalPrice: number | null;
  isAvailable: boolean;
  modifierGroupIds: (number | string)[];
}

export interface NormalizedMenuItem {
  id: number | string;
  code: string;
  name: string;
  description: string;
  basePrice: number;
  originalPrice: number | null;
  hasDiscount: boolean;
  isAvailable: boolean;
  imageUrl: string | null;
  hasVariations: boolean;
  variations: NormalizedVariation[];
  modifierGroups: NormalizedModifierGroup[];
}

export interface NormalizedCategory {
  id: number | string;
  name: string;
  description: string;
  itemCount: number;
  items: NormalizedMenuItem[];
}

export interface ExtractedCatalog {
  metadata: {
    extractionTier: 'disco_api' | 'ssr_next_data' | 'playwright_intercept';
    extractedAt: string;
    sourceUrl: string;
  };
  vendor: {
    id: number | string;
    code: string;
    name: string;
    rating: number | null;
    reviewCount: number;
    currency: string;
    address: string;
    latitude: number;
    longitude: number;
    cuisines: string[];
    heroImageUrl: string | null;
  };
  summary: {
    totalCategories: number;
    totalItems: number;
    totalVariations: number;
    totalModifierGroups: number;
  };
  categories: NormalizedCategory[];
}
```

---

## 6. CLI & Export Specifications (`src/cli.ts` & `src/exporters/`)

1. **CLI Commands & Flags:**
   ```bash
   npx tsx src/cli.ts --url "[https://www.foodpanda.com.bd/restaurant/w2oi/](https://www.foodpanda.com.bd/restaurant/w2oi/)..." [options]
   ```
   - `-u, --url <string>`: Foodpanda store URL or vendor code **[Required]**
   - `-r, --region <string>`: Country code override (`bd`, `my`, `sg`, `pk`) (Default: `bd`)
   - `-l, --lang <number>`: `language_id` parameter (`1` for English, `2` for local language) (Default: `1`)
   - `-o, --out <string>`: Output directory (Default: `./exports`)
   - `-f, --format <string>`: `json`, `csv`, or `all` (Default: `all`)
   - `--include-popular`: Keep the duplicate "Popular" category (Default: `false`)
   - `--tier <string>`: Force specific tier (`api`, `ssr`, `browser`)
   - `--proxy <string>`: Optional HTTP/SOCKS5 proxy URL

2. **CSV Export Format (`{vendor_code}_menu.csv`):**
   Flatten items so a merchant or POS importer can immediately ingest them:
   `Category Name,Item Code,Item Name,Description,Base Price,Original Price,Available,Variations Summary,Modifiers Summary,Image URL`
   - Format `Variations Summary` as: `Regular: 250 | Large: 450`
   - Format `Modifiers Summary` as: `Choice of Drink (Req 1-1): [Coke +0, Sprite +0] | Extra Toppings (Opt 0-3): [Cheese +50, Mushroom +40]`

---

## 7. Deliverables Required
Generate the complete, working implementation for every file in the file tree with zero placeholder comments (`// TODO`). Include a `README.md` showing installation and usage commands.