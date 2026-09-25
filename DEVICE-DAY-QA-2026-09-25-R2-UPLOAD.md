# Device Day QA — R2 Upload Verification (2026-09-25)

**Purpose:** Device verification of the Cloudflare R2 presigned-upload pipeline (expo-file-system `uploadAsync` header fidelity vs. the presign signature) — Device Day item 7.
**Status:** CLOSED — **PASS**; test baseline restored after verification.
**Source of truth:** this file (session report persisted 2026-09-25).
**Related (concrete paths):**
  - `lib/imageToURL.ts` — client upload pipeline (compress → presign → PUT)
  - `app/api/storage/upload-url+api.ts` — presign route (`SIGNED_PUT_HEADERS` binds content-type + cache-control into the signature)
  - `lib/storageFolders.ts` — shared folder constants + cache policy (`public, max-age=31536000, immutable`)
  - `lib/imageCompress.ts` — client-side compression (≤2 MB threshold, HEIC→JPEG)
  `DEVICE-DAY-QA-2026-09-23.md` / `DEVICE-DAY-QA-2026-09-23-CONTINUATION.md` / `DEVICE-DAY-QA-ENV-FIX-2026-09-23.md` — prior day reports (item 7 was NOT TESTED there).
**Last verified:** 2026-09-25, by coding model via execbro + adb on the connected test device, evidence below.
**How to update:** Append new evidence; never modify prior findings.

---

## Environment

- Metro 8081 serving with `dev-env-sync`-corrected LAN IP; Supabase DB reachable again (login + API routes working — the 2026-09-23 `CONNECT_TIMEOUT` blocker is gone).
- utils-server (port 3001) NOT running during this test — irrelevant to uploads (presign rides Metro 8081; PUT goes directly to Cloudflare R2). LogBox `ws` errors during the session were this and only this.
- Test driver `+8801700000001` (`test1234`), clean baseline: `profile_image_url = null`, zero `documents` rows.

## Test matrix & results

| Step | Profile photo (crop path) | Document (no crop) |
|---|---|---|
| Screen | Driver Profile → Personal Profile → Upload Photo | Profile → Documents → Start Onboarding → step 3 skip-vehicle path, Registration (Front) |
| Crop | Native 1:1 crop editor shown and confirmed (`allowsEditing: true`) | none (`allowsEditing: false`) |
| Presign | `{folder:"profile", contentType:"image/jpeg"}` | `{folder:"vehicle", contentType:"image/jpeg"}` |
| PUT | **2xx** | **2xx** — `[storage] uploaded to R2 {"key":"vehicle/…/…jpg"}` |
| Stored object (HEAD) | `Content-Type: image/jpeg` · `Cache-Control: public, max-age=31536000, immutable` · 200 | identical · 200 |
| DB | `users.profile_image_url` set to R2 URL | no `documents` row — wizard intentionally not submitted (vehicle record untouched via `skipVehicleStep`) |

**Why 2xx proves header fidelity:** the presign route binds `content-type` + `cache-control` into the signature (`SIGNED_PUT_HEADERS`); any mismatch between emitted and signed headers makes R2 reject with `403 SignatureDoesNotMatch`, and `imageToURL.ts` treats 403 as non-retryable. Two successful PUTs ⇒ emitted headers matched the signature bit-for-bit; HEAD responses confirm what R2 stored.

**Verdict: PASS — Device Day item 7 (R2 upload) verified on device.**

## Observations (no action required)

- Picker `quality: 0.8` re-encodes before upload (8229→3781 B, 26978→16730 B) — compressed-path passthrough never sees original bytes; final type stays `image/jpeg`, logged size == stored size.
- Onboarding step 3 requires all 7 vehicle docs to SUBMIT; upload fires on pick, before any submit — one card suffices to verify the document path without mutating the vehicle record.

## Baseline restoration (verified fresh later same day)

- `users.profile_image_url` → `null` ✓
- R2 `profile/…/` and `vehicle/…/` prefixes → 0 objects ✓
- Both public URLs → 404 (cache-busted HEAD) ✓
- `documents` never written ✓
- Device: test JPEGs scrubbed (file + MediaStore), app force-stopped; test-driver login token deliberately retained (device-QA runbook precondition). Generator JPEGs kept in `.tmp/` (gitignored) for reuse.
