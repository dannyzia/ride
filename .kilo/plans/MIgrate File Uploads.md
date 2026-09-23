# Migrate File Uploads: Supabase Storage → Cloudflare R2 + Client-Side Compression (v4, amended)

You are an expert full-stack engineer on this Expo (SDK 53) + Supabase + Drizzle codebase.
Read AGENTS.md first — it is binding (money rules N/A here, but conventions, validation
order, and docs-sync obligations all apply).

**Objective:** Replace Supabase Storage for image uploads with Cloudflare R2 via
pre-signed PUT URLs. Supabase stays for DB + auth. Add client-side image compression
so no image >2 MB is ever uploaded. Legacy Supabase assets must keep displaying.

**Amendment history:** v2 folded in the first adjudicated critique (2026-09-17):
generalized mime normalization, key randomness, Cache-Control, per-user rate
limiting, PUT retry with backoff, storageUrl hardening (https + exact host +
R2-only ownerId), corrected test paths, Rhizome DoD. v3 folds in the second
adjudicated critique (2026-09-17): R2 public-access toggle verification,
`R2_BUCKET_NAME` made required, retry extended to 429, r2Prefix slash
normalization, port test cases, rate-limit DoD simulation. v4 folds in the third
critique (2026-09-17): WebP passthrough/recompression rules, `file_size_bytes`
relaxed to `nonnegative()` (0 = legacy/unknown), empty-`r2Prefix` guard, SSL
verification, explicit R2-vs-our-429 distinction in retry. Explicitly rejected
(do NOT reintroduce): union types for legacy `documents` rows (the z.record is
POST wire format only — DB rows have `storage_url` text + `file_size_bytes` int
per row, `src/db/schema.ts:964`; GET shape unchanged, and GET endpoints never
run `docSchema` — see `documents+api.ts:11-33`); new
MIGRATION.md/DEVELOPMENT.md files; multipart resumable uploads; per-endpoint
folder binding; NODE_ENV suffix on the rate-limit key (each environment has its
own database, so `rate_limits` rows are already isolated); throwing on GIF
selection (documents are static verification evidence — convert first frame to
JPEG, don't error); fabricated "empirical basis" comments for compression
constants (Copy Truth Rule — we have no such data); a type-level test file for
`uploadImageToR2`'s return shape (tsc + consuming call sites already enforce
it); pre-work device-lab compression testing (impossible before 0.4 installs
the native module — covered by Task 10 DoD).

**Constraint gates before you write any code:**
- This work is authorized by Zia (feature-freeze lift for this item only — record that
  in the Rhizome issue).
- npm workspace: install ONLY from the repo root. NEVER run npm install/ci inside
  utils-server/. utils-server/ is untouched by this migration.

**Start by listing every file you will create or touch (the inventory below is
verified as of 2026-09-17 — re-grep to confirm nothing drifted).**

---

## Phase 0 — Pre-work (must be complete before Task 1)

### 0.1 Cloudflare MCP + R2 ops setup
1. Install the Cloudflare MCP server into the Kilo config (e.g.
   `npx @cloudflare/mcp-server-cloudflare` with the R2 binding) so bucket/domain
   operations are agent-managed. If MCP is unavailable, use wrangler CLI instead.
2. Verify the `ride.com.bd` DNS zone is on the target Cloudflare account
   (prerequisite for the custom domain).
3. Create the R2 bucket, location hint `apac` (closest to BD):
   `npx wrangler r2 bucket create driver-documents --location-hint=apac`
   (single bucket; the folder enum below is a KEY PREFIX, not separate buckets).
4. Create an R2 API token scoped to Object Read & Write on that bucket only →
   becomes `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
5. Connect a custom domain to the bucket: `assets.ride.com.bd` (public read, no
   list endpoint). Do NOT use the r2.dev dev domain in production.
6. **Verify public read actually works** — attaching a custom domain alone does
   NOT make objects public: enable the bucket's Public Access (Cloudflare
   dashboard → R2 → bucket → Settings → Public Access, or `wrangler r2 bucket
   info`) and prove it: PUT a scratch test object via the console, then
   `curl -I https://assets.ride.com.bd/<test-key>` → expect 200 with the
   expected Content-Type. Also verify TLS: `curl -vI https://assets.ride.com.bd/
   <test-key> 2>&1 | grep -iE 'SSL|certificate'` must show no
   "certificate verify failed" — iOS/Android enforce strict TLS, so a broken
   cert silently blocks uploads. Delete the test object afterwards.
7. CORS: not required (uploads come from the native app, which enforces no CORS).
   Note this in the Rhizome issue for future web-upload work.

### 0.2 Rhizome coordination
Create + claim a Rhizome task issue for this migration. Reserve the high-risk
resources before editing: `package.json`, `package-lock.json` (dep changes).
Use `save_attempt_note` checkpoints per the AGENTS.md completion format.

### 0.3 Environment variables
Add to `.env.local` (and EAS envs + any deploy envs). Server secrets must NEVER
be `EXPO_PUBLIC_*`:
- `CLOUDFLARE_ACCOUNT_ID` (server secret)
- `R2_ACCESS_KEY_ID` (server secret)
- `R2_SECRET_ACCESS_KEY` (server secret)
- `R2_BUCKET_NAME` (server config; REQUIRED — no silent default. A defaulting
  mismatch would write objects into a wrong-named bucket; the route fails fast
  with `500 server_misconfigured` when any R2 env var is missing/empty)
- `EXPO_PUBLIC_R2_DOMAIN` (public CDN base, e.g. `https://assets.ride.com.bd`)

### 0.4 Dependencies (repo root ONLY)
- `expo-file-system@~18.1.11` is ALREADY installed — verify, don't reinstall.
- `expo-crypto@~14.1.4` is ALREADY installed — used for key randomness.
- `npx expo install expo-image-manipulator` (SDK 53-native → a new dev build /
  EAS build is REQUIRED; OTA alone will not include it).
- `npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

---

## Task 1 — Client compression engine: `lib/imageCompress.ts` (NEW)
1. Input: `(uri, mimeType?)`. Mime source precedence: picker asset `mimeType`
   when the caller has it; else extension sniff (jpg/jpeg→image/jpeg, png→image/png,
   webp→image/webp, heic/heif→image/heic); unknown → treat as unsupported.
2. **Format normalization (generalized HEIC rule):** if the source mime is NOT in
   {`image/jpeg`,`image/png`,`image/webp`}, ALWAYS convert to JPEG via
   `expo-image-manipulator` — regardless of size. Rationale: the picker's
   `mediaTypes: ["images"]` admits GIF/BMP/TIFF; without normalization a small
   GIF would pass the picker then 400 at the server contentType allowlist.
3. Threshold `2 * 1024 * 1024` bytes (via `expo-file-system` `getInfoAsync`).
    - `<= 2 MB` (and already an allowed mime, incl. `image/webp`): return
      `{ uri, sizeBytes, contentType }` unchanged. WebP is already efficient, so
      small WebP is passed through with `contentType: image/webp`.
    - `> 2 MB` (any allowed mime): Pass 1: `ImageManipulator.manipulateAsync(uri,
      [{ resize: { width: 1200 } }], { compress: 0.75, format: SaveFormat.JPEG })`
      (aspect preserved). Re-check size via `getInfoAsync` on the result uri;
      if still > 2 MB, Pass 2: width 800, compress 0.65. A large WebP is
      **recompressed to JPEG**, not WebP — recompressing WebP→WebP is complex
      and rarely beneficial, and the final `contentType` must reflect actual
      bytes (so `image/jpeg` after any pass).
    - Export the pass parameters as named constants (`COMPRESS_PASS_1`,
      `COMPRESS_PASS_2`) for future tuning. Do NOT decorate them with invented
      empirical claims (Copy Truth Rule) — a plain "tunable, verify on device"
      comment is enough. Animated sources (GIF) convert to JPEG like any other
      non-allowed mime (first frame) — documents are static verification
      evidence, so erroring on GIF adds friction without value.
4. Return `{ uri: string, sizeBytes: number, contentType: string }` — the mime
   must reflect the FINAL bytes ('image/jpeg' after any pass/conversion, original
   mime only when untouched). This field feeds the PUT Content-Type (fixes the
   mismatch bug where a small PNG would be uploaded labeled image/jpeg).
5. **Failure handling (H3 rule — surface, never swallow):** wrap every
   manipulator/getInfo call in try/catch; on failure `logger.error` + throw a
   typed error the UI can show ("Could not process image — try another photo").
   Do NOT fall back to uploading the original bytes — that silently breaks the
   2MB guarantee. If a device cannot decode HEIC (possible on some Androids),
   the surfaced error is the correct outcome.
6. EXIF orientation: no code — covered by the device-verification checklist
   (portrait gallery photo must not arrive rotated; `manipulateAsync` is expected
   to bake orientation into pixels on SDK 53 — verify, don't assume).

## Task 2 — Pre-signed URL route: `app/api/storage/upload-url+api.ts` (NEW)
Follow repo conventions exactly: `verifySupabaseToken(request)` → 401 on failure;
body via `parseJsonBody(request, schema)` (never `request.json()`); errors as
`{ error: 'machine_code', message: '...' }`; log via `lib/logger` (no console.log).
1. **Rate limit first (after auth, before any S3 work):** reuse
   `rateLimitCount` from `lib/otpRateLimit.ts` (fixed 5-minute windows,
   `rate_limits` table). Key `r2upload:${supabaseUser.id}`, limit
   `R2_UPLOAD_MAX = 30` per window (onboarding legitimately fires ~10–14 uploads
   in one wizard run). Exceed → `429 { error: 'rate_limited', ... }`. Export the
   constant from the route module (or a small shared const) for tests.
2. Zod schema: `filename` (string; sanitize with the existing pattern
   `replace(/[^\w.\-]/g, '_')`, strip path separators, cap length 100),
   `folder` enum `['profile','documents','vehicle']` default `'documents'`,
   `contentType` enum allowlist `['image/jpeg','image/png','image/webp']`
   default `'image/jpeg'`.
3. `S3Client` for R2: endpoint
   `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
   region `'auto'`, credentials `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.
4. Key: `${folder}/${supabaseUser.id}/${Date.now()}-${randomSuffix}-${sanitizedFilename}`
   where `randomSuffix` = first 8 chars of `expo-crypto` `randomUUID()`
   (collision-proof under concurrent same-ms uploads; `expo-crypto` already
   installed). User scoping is a security property, not cosmetic.
5. `PutObjectCommand` MUST set `Bucket: process.env.R2_BUCKET_NAME` (the original
   draft never bound it), `Key`, `ContentType`, and
   `CacheControl: 'public, max-age=31536000, immutable'` — signing both forces
   the client PUT to send matching headers, and gives public GETs long-lived
   edge caching (safe: keys are unique per upload).
6. `getSignedUrl(..., { expiresIn: 300 })`.
7. `publicUrl`: `${process.env.EXPO_PUBLIC_R2_DOMAIN}/${key}` (strip trailing
   slashes from the domain).
8. Return `{ uploadUrl, key, publicUrl }`. Route is stateless (no DB write except
   the rate-limit counter) → exempt from the Idempotency-Key convention;
   document that in a code comment.

## Task 3 — Client pipeline: `lib/imageToURL.ts` (REWRITE)
1. Export `uploadImageToR2({ localUri, folder = 'documents', fileName, mimeType? })`
   (keep a `uploadImage` alias or update all 3 import sites — your choice, but
   grep `uploadImage` and leave zero dangling imports. Verified sites:
   `personal-profile/index.tsx:9`, `onboarding/index.tsx:22`,
   `edit-profile/index.tsx:19`).
2. `compressIfNeeded(localUri, mimeType)` → `{ uri, sizeBytes, contentType }`.
3. `POST /api/storage/upload-url` with the Supabase access token in
   `Authorization: Bearer`. Handle 429 `rate_limited` with a user-facing message.
4. Upload with `expo-file-system` `FileSystem.uploadAsync(uploadUrl, uri,`
   `{ httpMethod: 'PUT', uploadType: BINARY, headers: { 'Content-Type': contentType,
   'Cache-Control': 'public, max-age=31536000, immutable' } })` — headers MUST
   match what Task 2 signed. Streams from disk, avoids the fetch→blob memory
   spike. (fetch→blob is an acceptable fallback if a platform limitation
   appears; note it in the attempt.)
5. **Retry wrapper:** wrap `uploadAsync` in `putWithRetry` — max 3 attempts,
   backoff `500ms * attempt + 0–250ms jitter`, retry ONLY on network errors,
   HTTP >= 500, or HTTP 429 from R2 (R2 rate-limits under sustained load and
   backoff heals it); other 4xx fails immediately (signed-URL mismatches won't
   heal). The two 429s are already on separate code paths: this retry wraps
   ONLY the PUT to R2 (`uploadUrl`), so a 429 here is R2's; a 429 from OUR
   presign route is caught at step 3 (before `uploadAsync`) and surfaced to
   the user — never auto-retried. Guard: only retry a 429 if the request host
   matches `EXPO_PUBLIC_R2_DOMAIN`. Multipart/resumable uploads are
   explicitly out of scope.
6. Verify the PUT response status (2xx), else throw — surface failures, never
   swallow (H3 rule).
7. Return `{ publicUrl, key, fileSizeBytes: sizeBytes }`.

## Task 4 — Kill the duplicate upload path: `components/DocumentUploadCard.tsx`
It currently does its OWN inline Supabase upload (lines ~46–65) — refactor it to
call `uploadImageToR2` (folder `'documents'` or `'vehicle'` by doc context), passing
the picker asset's `mimeType` into the pipeline. Keep the existing UI contract
`onUploadComplete(path, url)` and EXTEND it: `onUploadComplete(path, url,
fileSizeBytes)` — existing 2-param callbacks keep compiling; the 3 onboarding
callbacks (`onboarding/index.tsx` lines 1307/1317/1340) must capture `fileSizeBytes`
and store `{ url, fileSizeBytes }` in their doc-state maps instead of bare strings.

## Task 5 — URL validator: `lib/storageUrl.ts` (UPDATE)
Change the signature to an options object (legacy `bucket` and R2 folder-prefix
are different concepts — legacy URLs carry the bucket in the path, R2 URLs carry
the folder prefix):
```ts
isAllowedStorageUrl(url: string, opts?: {
  bucket?: string;      // legacy Supabase bucket path check (e.g. 'driver-documents')
  r2Prefix?: string;    // required path prefix on the R2 branch (e.g. 'documents')
  ownerId?: string;     // R2-only: segment after the prefix must equal this
}): boolean
```
1. Enforce `protocol === 'https:'` for BOTH branches.
2. Legacy branch (UNCHANGED semantics, status quo): exact host equality against
   `SUPABASE_URL` host (keep the current `parsed.host !== storageHost` exact
   match), path prefix `/storage/v1/object/public/`, optional `bucket` check.
   Do NOT enforce `ownerId` here — legacy rows exist under an `anonymous/`
   uid fallback (`imageToURL.ts:12` historically) and must keep validating.
3. R2 branch: host must EXACTLY equal the host of `EXPO_PUBLIC_R2_DOMAIN`
   (no substring/suffix matching — reject `evil.com/assets.ride.com.bd`;
   non-default ports like `:8443` are rejected automatically because
   `URL.host` includes them; note `:443` is normalized away by the WHATWG URL
   parser, so it correctly passes); strip trailing slashes from `r2Prefix`
   before comparison; if `r2Prefix` is passed as an empty/whitespace string,
   reject (treat as a caller error) rather than silently widening the check to
   "path starts with /"; if `r2Prefix` passed, path must start
   `${r2Prefix}/`; if `ownerId` passed, the next path segment must equal it.
4. Update both existing callers to the new signature in Task 6.

## Task 6 — Persistence + validation gates
**Clarification (do not "fix" what isn't broken):** the `documents` z.record is
the POST wire format only. DB rows are per-doc with `storage_url` text +
`file_size_bytes` integer; GET shape is unchanged; legacy rows are never
re-validated and simply retain `file_size_bytes = 0` (read as "unknown" — no
backfill; out of scope); `app/api/admin/document/[id]/presigned-url+api.ts:36-42`
already passes full `https://` URLs through as-is — NO change needed there.
Note also that the GET endpoints (`documents+api.ts:11-33`) are plain
select/return and never run `docSchema`, so legacy `file_size_bytes = 0`
rows cannot be rejected by the schema at read time.
1. `app/api/driver/documents+api.ts`:
   - Replace the `file_size_bytes: 0` TODO (line ~108): change `documents` in
     `docSchema` from `z.record(z.string(), z.string().url())` to a record of
     `{ url: z.string().url(), file_size_bytes: z.number().int().nonnegative()
     .max(20 * 1024 * 1024) }`; insert maps `storage_url: value.url`,
     `file_size_bytes: value.file_size_bytes`. `nonnegative()` (not
     `.positive()`): `0` means "legacy/unknown size", `>0` is the real byte
     count. Add a code comment: `// 0 = legacy row, size unknown; >0 = actual
     bytes enforced by client-side compression`.
   - C3a check (line ~91): `isAllowedStorageUrl(url, { bucket: 'driver-documents',
     r2Prefix: 'documents', ownerId: supabaseUser.id })` — accepts R2 URLs scoped
     to `documents/${supabaseUser.id}/` OR any legacy Supabase driver-documents
     URL; rejects everything else.
2. `app/api/driver/me+api.ts` (~line 172): same dual validation for
   `profile_image_url` with `{ bucket: 'driver-documents', r2Prefix: 'profile',
   ownerId: supabaseUser.id }` — MISSING THIS BLOCKS EVERY PROFILE PHOTO SAVE
   POST-MIGRATION.
3. Callers to update for the new payload shape (verified complete list):
   - `onboarding/index.tsx:779` (profile photo → `uploadImageToR2` folder
     `'profile'`, PATCH body uses `.publicUrl`).
   - `DocumentUploadCard` + the 3 onboarding callbacks (Task 4).
   - `personal-profile/index.tsx:62` and `edit-profile/index.tsx:115`
     (folder `'profile'`, use `.publicUrl`).

## Task 7 — Admin viewer dual-URL support
`components/AdminDocumentViewer.tsx` signs every URL via `lib/presignUrl.ts`
(Supabase `createSignedUrl`). Update it: full `https://` URLs (R2 and legacy
public) render/passthrough directly (mirror the logic already in
`presigned-url+api.ts:36-42`); only `bucket/path`-form storage values go through
`generatePresignedUrl`. Do not delete `lib/presignUrl.ts` (still needed for
legacy rows). Leave `lib/dangerAlertTemplate.ts:41` (hardcoded legacy icon URL)
as-is — display only.

## Task 8 — Docs sync (AGENTS.md ⇄ CLAUDE.md rule)
- `docs/Plan/11-ENV-VARS.md`: add the 5 new vars.
- AGENTS.md env-vars section + CLAUDE.md line ~203 ("Storage: Supabase Storage
  (driver-documents bucket via lib/imageToURL.ts)") → R2 description.
- Update the two files together (binding sync rule).
- Do NOT create MIGRATION.md / DEVELOPMENT.md — runbook content goes in the
  Rhizome issue (see Task 10).

## Task 9 — Tests + validation order
New tests (real assertions — the vacuous-assertion gate is enforced at 3 levels;
paths follow repo convention: unit tests in `lib/__tests__/`, API tests in
`tests/api/`):
- `lib/__tests__/imageCompress.test.ts` (mock expo-file-system + manipulator;
  both compression passes, HEIC/GIF normalization, small-file passthrough,
  small WebP passthrough with `contentType: image/webp`, large WebP recompressed
  to JPEG with `contentType: image/jpeg`, manipulator-failure → thrown surfaced
  error, contentType reflects final bytes).
- `tests/api/storage/upload-url.test.ts` (mock S3Client/presigner + rate limiter;
  401, Zod failures, rate-limit 429 past R2_UPLOAD_MAX, key shape incl. random
  suffix + user scoping, ContentType + CacheControl binding, 300s expiry).
- `lib/__tests__/storageUrl.test.ts` (R2 accept, legacy accept, foreign-host
  reject, SUFFIX-host reject `evil.com/assets.ride.com.bd`, http-scheme reject,
  non-default-port reject `:8443`, default-port normalization accept `:443`,
  ownerId mismatch reject, r2Prefix mismatch reject, trailing-slash r2Prefix
  still matches, empty/whitespace `r2Prefix` reject, legacy branch ignores
  ownerId).
- Update `tests/api/driver/documents.test.ts` + `tests/api/driver/driver-flows.test.ts`
  (they mock `isAllowedStorageUrl`; new payload shape + file_size_bytes).
  Add to `documents.test.ts`: a legacy-row case asserting `file_size_bytes = 0`
  is accepted by the schema (0 = "unknown"); add to `driver-flows.test.ts`:
  a user exceeding 30 upload-url requests in one 5-minute window must get
  `429 { error: 'rate_limited' }` on the 31st.
Then, in order, all green: `npm run lint` → `npx tsc --noEmit` →
`npm run check:vacuous` → `npx jest --watchAll=false` (floor: 2035 tests green).
Commit-time: no console.log, no clerk/stripe/firebase strings.

## Task 10 — Rhizome issue: Definition of Done (local verification)
Record in the issue (not new doc files):
- R2 connectivity: generate a presigned URL via the route (or a scratch script
  against `lib/` helpers), `curl -X PUT` a small JPEG with the signed
  ContentType/Cache-Control headers, then GET the `publicUrl` — expect 200 +
  correct Content-Type, and `curl -I` on the public URL must show
  `Cache-Control: public, max-age=31536000, immutable`. Include common R2
  failure triage: 403 AccessDenied → token not scoped to the bucket; 404 on
  publicUrl → custom domain not attached OR bucket Public Access not enabled
  (0.1 step 6); SignatureDoesNotMatch → client headers differ from signed ones.
- HEIC test image (any iPhone photo) → verify JPEG normalization + size.
- Portrait-orientation gallery photo → verify not rotated after compression
  (methodology: use an EXIF Orientation=6 source; output must have
  width < height, i.e. orientation baked into pixels, not carried as EXIF).
- Rate-limit behavior: simulate 31 upload-url requests inside one 5-minute
  window for one user → 31st-and-later must return 429
  `{ error: 'rate_limited' }` (R2_UPLOAD_MAX = 30); a different user is
  unaffected.
- 429 source distinction: confirm the PUT retry only retries R2-sourced 429
  (uploadUrl host == EXPO_PUBLIC_R2_DOMAIN) and never auto-retries our own
  rate-limit 429 from the presign route (that one surfaces to the user).
- Note the upload retry/backoff behavior (incl. 429-from-R2 retry) and
  rate-limit ceiling for reviewers.

### Divergence from this plan's DoD — recorded 2026-09-23

**Item in question:** "429 source distinction: confirm the PUT retry only retries
R2-sourced 429 (`uploadUrl host == EXPO_PUBLIC_R2_DOMAIN`) and never auto-retries our
own rate-limit 429 from the presign route."

**Divergence:** the predicate this item names can never be true, so the requirement is
met by a status-driven rule instead of that host test. A presigned PUT URL carries the
R2 S3 API endpoint — `<bucket>.<account>.r2.cloudflarestorage.com` — while
`EXPO_PUBLIC_R2_DOMAIN` is the public-**read** domain (`ride.digital-papyrus.com`).
Executed against a real presigned URL:
`uploadUrl.includes(r2Host) === false`, so a host test there is dead code in every
case, not a gate.

**How the requirement's intent is met instead** (`lib/imageToURL.ts`): a non-2xx PUT
response is normalized into a typed error carrying its status, and the loop's SINGLE
retry classifier decides from that status — retry on network error / `>= 500` / `429`,
stop otherwise (`403` included, which is the signature-binding failure). Measured
against the real R2 host: an R2 `429` is retried (2 PUT attempts when the next
attempt succeeds, 3 before giving up); our own presign `429` never reaches the PUT loop
(0 PUT attempts) because it surfaces before it.

**What was done with the literal host test:** removed, rather than left in place as
unreachable code — it could never gate a decision. `lib/__tests__/imageUploadRetry.test.ts`
pins the resulting behavior in both directions.

**Rule followed:** § Model Chain & Orchestration of `AGENTS.md`, protocol item 2 —
"On divergence: the ruling wins, the divergence is recorded in-file — never silently
reconciled" — and item 3, "The file is the single source of truth." This plan is the
artifact that carried the unsatisfiable requirement, so the record lives here.

**Tracking caveat:** `.kilo/` is gitignored (`.gitignore` line 51) and this file was
never force-added, so this record is durable on disk but NOT version-controlled. This
plan's own Task 10 designates the Rhizome issue as the home for DoD evidence — mirror
this note there if the file stays untracked.

## Out of scope (note as follow-ups in the Rhizome issue, do NOT build)
- Backfill script copying legacy Supabase objects to R2.
- Presigned GET for sensitive docs (current R2 custom domain is public-read,
    same exposure as today's public Supabase bucket — improvement is no list
    endpoint + unguessable keys).
- Orphaned-upload cleanup (presigned-but-never-PUT objects).
- Web-admin direct uploads (would need R2 CORS).
- Multipart/resumable uploads.

---

## Implementation Grounding (codebase-verified, 2026-09-17)

**Purpose:** Verified import paths, helper signatures, code skeletons, and pitfalls for each task. Every claim below was checked against disk. Integrates the revised implementation description (Fable 5.1 v5) — zero invented helpers, strict adherence to verified facts.

### Verified Helper Inventory

| Helper | Import path | Signature / behavior |
|--------|-------------|---------------------|
| `verifySupabaseToken` | `@/lib/auth` (`lib/auth.ts:25`) | `async (request: Request) => SupabaseUser` — **throws** `{ status: 401 }` on failure, never returns falsy |
| `parseJsonBody` | `@/lib/parseBody` (`lib/parseBody.ts:24`) | `async (request, schema) => { ok: true, data: T } \| { ok: false, response: Response }` — **never throws**, caller checks `ok` |
| `isAllowedStorageUrl` | `@/lib/storageUrl` (`lib/storageUrl.ts:13`) | `(url: string, bucket?: string) => boolean` — exact host match, `/storage/v1/object/public/` prefix, optional bucket check |
| `logger` | `@/lib/logger` | `logger.info(msg, data?)`, `logger.error(msg, data?)`, `logger.warn(msg, data?)` |
| `rateLimitCount` | `@/lib/otpRateLimit` (`lib/otpRateLimit.ts:20`) | `async (key: string) => number` — **one arg only**, 5-min window hardcoded (`WINDOW_MS`), returns count |
| `getErrorStatus` | `@/lib/errors` (`lib/errors.ts:25`) | `(err: unknown) => number \| undefined` |
| `supabase` | `@/lib/supabase` (client) | `supabase.auth.getSession()` → `data.session.access_token` (pattern: `lib/fleetAuth.ts:12-14`, `lib/imageToURL.ts:11`) |
| `generatePresignedUrl` | `@/lib/presignUrl` | `(bucket: string, path: string, expiresIn: number) => string \| null` — Supabase signed URL |
| `UploadType` | `expo-file-system` | `FileSystem.UploadType.BINARY` — import as `import * as FileSystem from 'expo-file-system'` |
| `randomUUIDAsync` | `expo-crypto` | `async () => Promise<string>` — import as `import { randomUUIDAsync } from 'expo-crypto'` |

**Does NOT exist (do not import):**
- `@/lib/apiHelpers` / `createErrorResponse` — use inline `Response.json({ error, message }, { status })`
- `@/lib/supabaseClient` / `SUPABASE_URL` export — use `process.env.SUPABASE_URL`
- `getSupabaseAccessToken` — use `supabase.auth.getSession()` pattern
- `Constants.getDeviceIdAsync` in server routes — `expo-constants` is client-only; rate-limit on `supabaseUser.id` only

### Additional Verified Facts

- **eas.json** already exists at repo root. Do NOT replace it — merge any changes.
- **expo** version is `^53.0.0` (`package.json:49`), NOT SDK 50. `npx expo install expo-image-manipulator` resolves the SDK 53-compatible version automatically — do not pin manually.
- **iOS is parked** (no Apple Developer Program membership). Build and test on Android only.

---

### Task 1 — Client Compression Engine (`lib/imageCompress.ts` — NEW)

**Imports:**
```typescript
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from './logger';
```

**Key APIs** (verify against SDK 53 docs):
- `FileSystem.getInfoAsync(uri)` → `{ exists: boolean, size: number }`
- `ImageManipulator.manipulateAsync(uri, [{ resize: { width, height } }], { compress, format: SaveFormat.JPEG })` → `{ uri, width, height }`

**Exports:** `compressIfNeeded`, `sanitizeFilenameBase`, `COMPRESS_PASS_1`, `COMPRESS_PASS_2`.

**Logic:**
1. Determine MIME (picker → extension sniff → undefined).
2. If MIME ∉ {`image/jpeg`, `image/png`, `image/webp`}: convert to JPEG via manipulator (GIF first frame, not an error).
3. Size ≤ 2MB and allowed MIME → passthrough unchanged.
4. Size > 2MB: Pass 1 (`width: 1200, compress: 0.75` JPEG). Re-check. Still > 2MB → Pass 2 (`width: 800, compress: 0.65` JPEG). Large WebP → JPEG (not WebP recompression).
5. After 2 passes still > 2MB → throw.
6. Try/catch every manipulator call → `logger.error` + throw. Never fall back to original bytes.
7. EXIF orientation: `manipulateAsync` bakes orientation into pixels on SDK 53. Verify on device with Orientation=6 portrait photo.

---

### Task 2 — Pre-signed URL Route (`app/api/storage/upload-url+api.ts` — NEW)

**Imports:**
```typescript
import { verifySupabaseToken } from '@/lib/auth';           // NOT @/lib/supabase
import { parseJsonBody } from '@/lib/parseBody';             // NOT @/lib/apiHelpers
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import { rateLimitCount } from '@/lib/otpRateLimit';
import { randomUUIDAsync } from 'expo-crypto';               // NOT Crypto.randomUUID()
```

**Auth** (verified from `documents+api.ts:52-60`):
```typescript
let supabaseUser;
try {
  supabaseUser = await verifySupabaseToken(request);
} catch (err) {
  const status = (err as { status?: number }).status;
  if (status === 401) return Response.json({ error: 'unauthorized', message: 'Authentication required' }, { status: 401 });
  throw;
}
```

**Body parsing** (verified from `documents+api.ts:62-65`):
```typescript
const parsed = await parseJsonBody(request, uploadUrlSchema);
if (!parsed.ok) return parsed.response;
const { filename, folder, contentType } = parsed.data;
```

**Rate limit** (ONE arg, verified from `lib/otpRateLimit.ts:20`):
```typescript
const count = await rateLimitCount(`r2upload:${supabaseUser.id}`);
if (count > R2_UPLOAD_MAX) {
  return Response.json({ error: 'rate_limited', message: 'Too many uploads. Wait a few minutes.' }, { status: 429 });
}
```

**Key + PutObject + presign:**
```typescript
const s3 = new S3Client({
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
});
const randomSuffix = (await randomUUIDAsync()).substring(0, 8);
const sanitizedFilename = filename.replace(/[^\w.\-]/g, '_');
const key = `${folder}/${supabaseUser.id}/${Date.now()}-${randomSuffix}-${sanitizedFilename}`;
const command = new PutObjectCommand({
  Bucket: process.env.R2_BUCKET_NAME!, Key: key, ContentType: contentType,
  CacheControl: 'public, max-age=31536000, immutable',
});
const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
const publicUrl = `${(process.env.EXPO_PUBLIC_R2_DOMAIN ?? '').replace(/\/+$/, '')}/${key}`;
return Response.json({ uploadUrl, key, publicUrl });
```

**Notes:** No `export const config` (Next.js convention, not Expo). No `expo-constants` (client-only). Route is stateless → exempt from Idempotency-Key convention (document in code comment).

---

### Task 3 — Client Pipeline Rewrite (`lib/imageToURL.ts` — REWRITE)

**Imports:**
```typescript
import { supabase } from './supabase';
import { FileSystem } from 'expo-file-system';
import { logger } from './logger';
import { compressIfNeeded, sanitizeFilenameBase } from './imageCompress';
```

**Steps:**
1. Compress: `const compressed = await compressIfNeeded(localUri, mimeType);`
2. Auth token (verified from `lib/fleetAuth.ts:7-15`, `lib/imageToURL.ts:11`):
   ```typescript
   const { data: { session } } = await supabase.auth.getSession();
   const token = session?.access_token;
   if (!token) throw Object.assign(new Error('Not authenticated'), { status: 401 });
   ```
3. Presign fetch (OUTSIDE retry loop — structural 429 distinction):
   ```typescript
   const response = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/storage/upload-url`, {
     method: 'POST',
     headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
     body: JSON.stringify({ filename: sanitizeFilenameBase(fileName), folder, contentType: compressed.contentType }),
   });
   ```
   - Our 429 surfaces here → user-facing message → **never retried**.
4. Retry loop (wraps ONLY `FileSystem.uploadAsync` — R2 PUT):
   ```typescript
   for (let attempt = 0; attempt < 3; attempt++) {
     try {
       await FileSystem.uploadAsync(uploadUrl, compressed.uri, {
         httpMethod: 'PUT',
         uploadType: FileSystem.UploadType.BINARY,
         headers: { 'Content-Type': compressed.contentType, 'Cache-Control': 'public, max-age=31536000, immutable' },
       });
       return { publicUrl, key, fileSizeBytes: compressed.sizeBytes };
     } catch (error: any) {
       const status = error?.status;
       const retryable = !error || (typeof status === 'number' && (status >= 500 || status === 429));
       if (!retryable || attempt === 2) break;
       await new Promise(r => setTimeout(r, 500 * (attempt + 1) + Math.floor(Math.random() * 250)));
     }
   }
   ```
   - **Note:** `error?.status` on expo-file-system errors — verify exact shape on device.

**Backward-compatible alias:** Update all 3 call sites to `uploadImageToR2(...)` and delete the `uploadImage` export. Verified sites: `personal-profile/index.tsx:9`, `onboarding/index.tsx:22`, `edit-profile/index.tsx:19`.

---

### Task 4 — Remove Duplicate Upload Path (`components/DocumentUploadCard.tsx`)

**Current props:** `{ docType: string; label: string; onUploadComplete: (path: string, url: string) => void }`.
**Inline upload:** Lines 46–65 (Supabase storage).
**Changes:**
- Remove inline upload. Import `uploadImageToR2` from `@/lib/imageToURL`.
- Call `uploadImageToR2({ localUri, folder, fileName, mimeType })`.
- Extend callback: `onUploadComplete(path, url, fileSizeBytes)`.
- Update `DocumentUploadCardProps` interface.
- Update 3 onboarding callbacks (lines 1307/1317/1340): store `{ [f.key]: { url, fileSizeBytes } }` instead of bare string.

---

### Task 5 — URL Validator Update (`lib/storageUrl.ts`)

**Current:** `process.env.SUPABASE_URL` for host, exact equality, `/storage/v1/object/public/` prefix.
**New signature:** `isAllowedStorageUrl(url, opts?: { bucket?, r2Prefix?, ownerId? })`
**Implementation:**
- `https:` protocol for both branches.
- Legacy branch (when `opts.bucket`): exact host + `/storage/v1/object/public/${opts.bucket}/` prefix. No `ownerId` check (legacy rows may have anonymous uid).
- R2 branch (when `opts.r2Prefix` + `opts.ownerId`): exact host from `new URL(process.env.EXPO_PUBLIC_R2_DOMAIN).host`. Normalize `r2Prefix` (strip trailing `/`). Reject empty/whitespace `r2Prefix`. Path must start `${r2Prefix}/`. Next segment must equal `ownerId`.
- `bucket` and `r2Prefix` are mutually exclusive in practice. If both passed, prefer legacy branch first (matching current behavior). Document in code comment.
- No `@/lib/supabaseClient` import (doesn't exist).

---

### Task 6 — Persistence + Validation Gates

**`app/api/driver/documents+api.ts`** (verified, lines 1–179):
- **docSchema** (line 38–50): change `documents: z.record(z.string(), z.string().url())` to `z.record(z.string(), z.object({ url: z.string().url(), file_size_bytes: z.number().int().nonnegative().max(20 * 1024 * 1024) }))`. Add comment: `// 0 = legacy row, size unknown; >0 = actual bytes`.
- **Insert mapping** (line 101–109): `storage_url: value.url`, `file_size_bytes: value.file_size_bytes`.
- **C3a check** (line 91–99): `isAllowedStorageUrl(url, { bucket: 'driver-documents', r2Prefix: 'documents', ownerId: supabaseUser.id })`.

**`app/api/driver/me+api.ts`** (verified, line 172):
- Change `isAllowedStorageUrl(parsed.data.profile_image_url, 'driver-documents')` to `isAllowedStorageUrl(parsed.data.profile_image_url, { bucket: 'driver-documents', r2Prefix: 'profile', ownerId: supabaseUser.id })`.

**Caller updates** (complete, verified):

| File | Line | Current | New |
|------|------|---------|-----|
| `onboarding/index.tsx` | 779 | `uploadImage(photoLocalUri, 'driver_photo/...')` | `uploadImageToR2({ localUri: photoLocalUri, folder: 'profile', fileName: '...' })` |
| `personal-profile/index.tsx` | 62 | `uploadImage(photo, 'profiles/...')` | `uploadImageToR2({ localUri: photo, folder: 'profile', fileName: '...' })` |
| `edit-profile/index.tsx` | 115 | `uploadImage(photo, 'profiles/...')` | `uploadImageToR2({ localUri: photo, folder: 'profile', fileName: '...' })` |
| `onboarding/index.tsx` | 1307/1317/1340 | `(_path, url) => ...url` | `(_path, url, fileSizeBytes) => ...{ url, fileSizeBytes }` |

---

### Task 7 — Admin Document Viewer (`components/AdminDocumentViewer.tsx`)

**Verified shape:** Takes `{ documentId: string }` (line 7–9). Splits into bucket/path, calls `generatePresignedUrl(bucket, path, 300)` from `@/lib/presignUrl`. Renders `<img>` / `<iframe>` / `<a>`.
**Change:** If `documentId` starts with `https://` → render directly (R2 or legacy public). Else → existing `generatePresignedUrl` logic unchanged. Do NOT add `Document` type, `doc.userId`, or `fileSizeBytes` display — none exist in the real component.

---

### Task 8 — Docs Sync

- `docs/Plan/11-ENV-VARS.md`: Add the 5 new vars. Verify the file's existing format before adding.
- `AGENTS.md`: Append to env-vars section: "R2 secrets are server-only; `EXPO_PUBLIC_R2_DOMAIN` is the only client-safe R2 var. `R2_BUCKET_NAME` is REQUIRED (no default)."
- `CLAUDE.md` (~line 203): Update storage line to reflect R2 migration.
- **Bind:** update AGENTS.md and CLAUDE.md together per the sync rule.
- Do NOT create `MIGRATION.md` / `DEVELOPMENT.md`.

---

### Task 9 — Tests + Validation Order

| Path | Status | Content |
|------|--------|---------|
| `lib/__tests__/imageCompress.test.ts` | NEW | Compression passes, HEIC/GIF normalization, WebP passthrough/recompression, failure surfaced, contentType correctness |
| `tests/api/storage/upload-url.test.ts` | NEW | Mock S3Client/presigner, 401, Zod failures, rate-limit 429, key shape (user scoping + random suffix), ContentType + CacheControl binding, 300s expiry |
| `lib/__tests__/storageUrl.test.ts` | NEW | R2 accept, legacy accept, foreign-host reject, suffix-host reject, http-scheme reject, non-default-port reject `:8443`, default-port normalization `:443`, ownerId mismatch, r2Prefix mismatch, trailing-slash r2Prefix, empty r2Prefix reject, legacy ignores ownerId |
| `tests/api/driver/documents.test.ts` | **UPDATE** (exists) | New payload shape `{ url, file_size_bytes }`, legacy row `file_size_bytes = 0` accepted |
| `tests/api/driver/driver-flows.test.ts` | **UPDATE** (exists) | Rate-limit 31st request → 429 |

**Validation order:** `npm run lint` → `npx tsc --noEmit` → `npm run check:vacuous` → `npx jest --watchAll=false` (floor: 2035 tests green). Commit-time: no `console.log`, no clerk/stripe/firebase strings.

---

### Task 10 — Rhizome DoD

Record in the issue (not new doc files):
- **R2 connectivity:** presigned URL → `curl -X PUT` with signed headers → GET publicUrl → 200 + correct Content-Type. `curl -I` → `Cache-Control: public, max-age=31536000, immutable`. Triage: 403 = token not scoped; 404 = domain not attached or Public Access not enabled; SignatureDoesNotMatch = header mismatch.
- **HEIC test:** iPhone photo → JPEG normalization + size.
- **Portrait test:** EXIF Orientation=6 → output width < height.
- **Rate-limit:** 31 requests in 5-min window → 31st = 429. Different user unaffected.
- **429 distinction:** PUT retry only retries R2-sourced 429; our presign 429 surfaces.
- **iOS out of scope:** no Apple Developer membership — Android-only verification.

---

### Pitfalls to Avoid

| Pitfall | Why it's wrong |
|---------|---------------|
| `import { verifySupabaseToken } from '@/lib/supabase'` | It's in `@/lib/auth` |
| `import { parseJsonBody, createErrorResponse } from '@/lib/apiHelpers'` | `apiHelpers` doesn't exist; `parseJsonBody` is in `@/lib/parseBody`; use inline `Response.json` |
| `if (!supabaseUser) return 401` | `verifySupabaseToken` **throws**, never returns falsy |
| `rateLimitCount(key, 5 * 60)` | Takes **one** arg only; window is hardcoded |
| `body = await parseJsonBody(...)` then destructure directly | Returns `{ ok, data\|response }`; check `ok` first |
| `Crypto.randomUUID()` | Correct: `await randomUUIDAsync()` |
| `Constants.getDeviceIdAsync()` in `app/api/` routes | Client-only module; use `supabaseUser.id` for rate-limit key |
| `import { SUPABASE_URL } from '@/lib/supabaseClient'` | No such module; use `process.env.SUPABASE_URL` |
| `export const config = { maxDuration: 30 }` | Next.js convention, not Expo |
| `npx expo run:ios` | iOS parked; Android-only |
| `tests/api/driver/documents.test.ts` listed as NEW | It already EXISTS — it is an UPDATE |
