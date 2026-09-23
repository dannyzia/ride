# Implementation Plan — Free-Floating Language Toggle (EN ↔ বাংলা)

**Purpose:**     Implement a one-tap, every-screen language toggle mirroring the floating theme toggle. Read before implementing this feature.
**Owner:**       Coding model (Zia-ordered; feature-freeze lift for this item only)
**Status:**      ACTIVE plan — not yet implemented
**Source of truth:** this file until implementation lands; then the code + this file's verification log
**Related (concrete paths):**
  - `components/GlobalActionButtons.tsx` — existing draggable hamburger+SOS stack (the every-screen overlay in (main)+admin)
  - `app/(auth)/_layout.tsx` — the ONLY floating theme toggle (mount pattern to mirror)
  - `i18n/i18n.ts` — i18next init + AsyncStorage persistence (`setLanguage`)
  - `lib/useAppearance.ts` — zustand persist store carrying the `language` mirror field
  - `lib/__tests__/i18n-smoke.test.ts` — total locale-completeness CI guard
**Last verified:** 2026-09-17, by Kilo (planning), via direct file reads (citations below)
**How to update:** append round-verification notes at the bottom after execution

---

## 1. Verified facts (do not re-derive)

| Fact | Citation |
|---|---|
| Floating theme toggle exists ONLY in (auth): local `ThemeToggle()` sibling of `<Stack>`, absolute `top: 50, right: 20`, 44×44 circle, one-tap `setTheme(isDark ? "light" : "dark")`, icon = TARGET state, hidden on `driver-splash`, zIndex 100 | `app/(auth)/_layout.tsx:7-51` |
| (main) has NO floating theme toggle — only inline header toggles (e.g. driver home header cluster: theme + break + offline buttons, top-right) and settings-screen cards | `app/(main)/(rider)/d/(tabs)/index.tsx:1080-1197`, `components/ThemeToggle.tsx` |
| The every-screen overlay mechanism in (main)+admin is the draggable stack (hamburger ABOVE SOS, bottom-right, bottom-right-offset cached, clamped) | `components/GlobalActionButtons.tsx:113-251, 400-465`; shared by `app/(main)/_layout.tsx:16` and `app/admin/_layout.tsx:13` |
| i18n: react-i18next; `setLanguage(lang)` writes AsyncStorage `ride:i18n:language` AND `i18n.changeLanguage`; `initI18n()` hydrates at startup from that key | `i18n/i18n.ts:33-63`, `lib/storageKeys.ts:14`, `app/_layout.tsx:183-187` |
| Dual store: `useAppearance.language` (zustand persist — VERIFIED config: `persist(..., { name: 'appearance-storage', storage: createJSONStorage(() => AsyncStorage) })`, `lib/useAppearance.ts:13-22`) — its ONLY consumers are `services-hub.tsx:22` and `(tabs)/home/index.tsx:100` (vehicle-category `display_bn/display_en` labels). Existing settings language screens write ONLY the i18n side (customer: `onPress={() => setLanguage(lang.code)}`; driver: `selectLang` → `persistLanguage(code)`) → those two pill screens stay stale after a settings switch for the whole session (the live split) | `lib/useAppearance.ts:6-23`, `app/(main)/(customer)/(tabs)/settings/app-language/index.tsx:93`, `app/(main)/(rider)/settings/language/index.tsx:35-38` |
| `setLanguage` ordering weakness: `AsyncStorage.setItem` runs BEFORE `i18n.changeLanguage` inside ONE try — if the storage write rejects, the live language switch is silently skipped (`catch` swallows). For a headline one-tap control this is a "tap does nothing" failure mode | `i18n/i18n.ts:33-40` |
| Driver settings language screen ALSO has its own floating theme toggle (`absolute top-16 right-4`, 40×40) — third instance of the floating-theme pattern; no placement impact | `app/(main)/(rider)/settings/language/index.tsx:71-78` |
| Locale guard: every `t('ns.key')` under `app/`+`components/` must resolve in BOTH locales; hardcoded-string check only walks rider screens | `lib/__tests__/i18n-smoke.test.ts:33-158, 160-227` |
| Bangla already renders via system font fallback under Jakarta classNames (bn locale in daily use; "বাংলা" shown in settings) | `app/(main)/(customer)/(tabs)/settings/app-language/index.tsx:21` |
| Test infra: jest-expo preset, NO @testing-library/react-native; all tests are logic-level; AsyncStorage mocked via the `mockStore` Map pattern | `jest.config.js`, `lib/__tests__/sosQueue.test.ts:9-23` |
| expo-updates is DISABLED (`enabled: false`); size round changed the autolink set → a dev-client rebuild is ALREADY owed (unrelated to this feature) | `app.config.js:33`, `docs/size-audit.md` §7.1 |

## 2. Design decisions

**D1 — Component.** New `components/LanguageToggle.tsx`: a content-only circular button (fills its parent, no absolute positioning of its own). Reads current language from `useTranslation().i18n.language`. Label shows the TARGET (mirror of the theme toggle's icon semantics): `বাং` when active=en, `EN` when active=bn. Static labels — never passed through `t()` (no new locale keys, per requirement). Pattern A theme tokens (`isDark ? …Dark : …Light`), `Pressable`, `hitSlop 12`, `accessibilityRole="button"`, static `accessibilityLabel="Switch language"` (GAB precedent: static English a11y labels). Text: `fontFamily "Jakarta-SemiBold"`, fontSize ~13 (Bengali glyph falls back to system font — established behavior).

**D2 — Dual write (single tap), hardened write primitive.** In `i18n/i18n.ts`, REPLACE `setLanguage` with a single hardened export (after Decision B its only two callers — the settings screens — are repointed anyway, so no compat shim is needed):
- `applyLanguage(lang: SupportedLanguage): void` — the ONE dual-write primitive every switch path uses:
  1. `i18n.changeLanguage(lang)` FIRST, own try — every `t()` screen re-renders via the `languageChanged` event (resources are bundled, so resolution is immediate). Storage failure can no longer block the live switch (fixes the `setLanguage` ordering weakness, §1).
  2. Best-effort persistence: `void AsyncStorage.setItem(STORAGE_KEYS.LANGUAGE, lang).catch(() => {})`.
  3. `useAppearance.getState().setLanguage(lang)` — updates the zustand persisted mirror → `services-hub` + customer-home vehicle pills re-render.
- `toggleLanguage(): void` — `next = i18n.language === 'bn' ? 'en' : 'bn'; applyLanguage(next);` (what the button calls).

Import direction `i18n/i18n.ts → lib/useAppearance` is acyclic (useAppearance imports nothing from i18n).

**D3 — Boot reconciliation.** In `initI18n()`, after `loadPersistedLanguage()`, add `useAppearance.getState().setLanguage(lng)` — heals the pre-existing split for users who switched via the old settings screens (zustand said `en`, i18n said `bn`). Known theoretical race: zustand persist rehydrate could overwrite afterwards (worst case = today's behavior; the next toggle re-syncs). Document in a comment, do not engineer around it.

**D4 — State source of truth after toggle: `i18n.language`.** It drives rendering (all `t()` consumers + the toggle's own label via useTranslation). The zustand `language` field is a write-through mirror consumed only by the two `display_*` screens.

**D5 — Mount points (2).** "Every screen" = (auth) + (main); admin web and `track/`/`+not-found` are out of the floating-toggle scope (GAB web member is Platform-gated off).
- **(auth):** `app/(auth)/_layout.tsx` — render inside the existing `!isSplash` conditional, wrapped in an absolute View at `top: 50, right: 76` (theme toggle keeps `right: 20`; 44 + 12 gap = no overlap, fits ≥320dp screens), zIndex 100.
- **(main)+admin: `components/GlobalActionButtons.tsx` — add LanguageToggle as a THIRD member of the draggable stack, crowning it (topmost: language, then hamburger, then SOS).** Rationale (evidence-based): a fixed top-right floating button collides with the driver-home header cluster (`d/(tabs)/index.tsx:1132-1196`: theme+break+offline buttons); top-left/bottom-left are similarly occupied. The draggable stack is the repo's established conflict-free every-screen mechanism. Because the cached stack offset anchors bottom-right and the stack grows UPWARD, SOS and hamburger keep their pixel positions for existing users; only the new button is added above. Stack math: `stackHeight` becomes `BTN_SIZE * n + BTN_GAP * (n-1)` where n counts rendered buttons; render offsets (RN `top` grows DOWNWARD — smaller offset = higher on screen, same convention as the existing hamburger-at-anchor / SOS-at-`+60` pair at `GlobalActionButtons.tsx:412-439`): language at `stackPos.y` (topmost, smallest `top`), hamburger at `+BTN_SIZE+BTN_GAP`, SOS at `+2*(BTN_SIZE+BTN_GAP)` (bottom). Do NOT reorder these — placing language at the largest offset would put it BELOW SOS and break the position-preservation property. Existing clamp/drag/cached-offset logic is unchanged. Gate the language member with `Platform.OS !== "web"` (admin web unaffected; `hasSos=false` admin native stack = hamburger + language).

**D6 — Ship vehicle.** Pure JS, no new deps, no native modules, no app.config.js change → lands via Metro/Fast Refresh on the existing dev client; **no rebuild required for this feature**. Note: a dev-client rebuild is independently owed from the size round (`90ef9c5` autolink change) — it will carry this feature into the binary naturally. OTA: no production OTA channel (updates disabled); next EAS release build includes it.

**D7 — Settings screens onto `applyLanguage` (DECIDED — Zia, 2026-09-17).** Both existing language settings screens currently write ONLY the i18n side (`app-language/index.tsx:93`, `settings/language/index.tsx:37`), leaving the zustand mirror stale for the whole session (vehicle pills don't flip) until the D3 boot sync heals it. Repoint both `onPress`/`selectLang` handlers to `applyLanguage(code)` — 2 one-line edits + import swap; closes the split on ALL write paths.

**D8 — Label semantics (DECIDED — Zia, 2026-09-17: show TARGET).** Button shows the TARGET language (`বাং` when active=en, `EN` when active=bn) — mirrors the theme toggle's icon semantics (`isDark ? "sunny" : "moon"` shows the action). An external review argued for CURRENT-display (keyboard-globe precedent); Zia ruled target. Do not reopen.

## 2.1 Decision log

| # | Decision | Status |
|---|---|---|
| A | (main) placement = third member of draggable GAB stack (crowns it; SOS/hamburger keep positions; web-gated off) | **DECIDED — Zia, 2026-09-17** |
| B | Both language settings screens repointed to `applyLanguage` (D7) | **DECIDED — Zia, 2026-09-17** |
| C | Label shows TARGET language (D8), not current — external review argued current; owner ruled target | **DECIDED — Zia, 2026-09-17** |

## 3. Task list (ordered)

1. **`i18n/i18n.ts`** (touch)
   - Import `useAppearance` from `@/lib/useAppearance`.
   - Replace `setLanguage` with `applyLanguage(lang): void` per D2: `i18n.changeLanguage` first (own try), fire-and-forget `AsyncStorage.setItem` (own catch), then `useAppearance.getState().setLanguage(lang)`.
   - Add `export function toggleLanguage(): void` — `next = i18n.language === 'bn' ? 'en' : 'bn'; applyLanguage(next);`.
   - In `applyLanguage`, a one-line comment noting key exclusivity: `ride:i18n:language` (STORAGE_KEYS.LANGUAGE) is the SOLE i18n persistence key — the zustand mirror persists separately under `appearance-storage`; no other mechanism writes either.
   - In `initI18n()`: mirror-sync zustand after `loadPersistedLanguage()` (D3, with race comment).
2. **`components/LanguageToggle.tsx`** (create) — per D1; calls `toggleLanguage()` from `@/i18n/i18n`.
3. **`app/(auth)/_layout.tsx`** (touch) — import + render `<LanguageToggle />` inside an absolute wrapper (`top: 50, right: 76, width: 44, height: 44, zIndex: 100`) in the `!isSplash` branch, beside the existing ThemeToggle. Note: language hitSlop extends to exactly `right: 64` = theme toggle's right edge — adjacent, zero overlap; use hitSlop 12 to match GAB.
4. **`components/GlobalActionButtons.tsx`** (touch) — per D5 (Decision A): `hasLang = Platform.OS !== "web"`; extend `stackHeight`; insert language dragWrapper at the top of the stack; shift hamburger/SOS offsets; keep drag/clamp/cache code untouched. Update the stack-geometry comment block (`GlobalActionButtons.tsx:113-121`) to describe the 3-member stack (language / hamburger / SOS, `BTN_SIZE=48`, `BTN_GAP=12` as the single geometry source) so the constants stay authoritative for future maintainers.
5. **`app/(main)/(customer)/(tabs)/settings/app-language/index.tsx`** + **`app/(main)/(rider)/settings/language/index.tsx`** (touch, Decision B) — swap the `setLanguage`/`persistLanguage` import for `applyLanguage`; `onPress={() => applyLanguage(lang.code)}` / `selectLang` body (`applyLanguage(code as SupportedLanguage)`). Remove the now-unused i18n import in each file if nothing else uses it.
6. **`lib/__tests__/languageToggle.test.ts`** (create) — see §4.
7. Run gates (§5), fix, append round-verification notes to this file.

**Process notes (implementer):**
- Conventional commit suggested: `feat(rider): free-floating language toggle (EN/Bangla)`. Single commit acceptable under the freeze lift.
- AGENTS.md / CLAUDE.md sync NOT required — no critical-rule, architecture-boundary, env-var, or known-issue change.
- If this item is tracked in Rhizome, execute under a claimed issue per the repo workflow; none of the touched files is on the high-risk reserve list, so no resource reservation is mandated.
- No `npm install` of any kind — zero dependency changes (workspace root-only rule is trivially satisfied).

## 4. Test approach

**CI-testable (no device):**
- `lib/__tests__/languageToggle.test.ts`, copying the `mockStore` AsyncStorage mock AND its reset discipline (`lib/__tests__/sosQueue.test.ts:9-23, 63-73`): `beforeEach` clears `mockStore` + `jest.clearAllMocks()` AND resets language state to the `en` baseline (`i18n.changeLanguage('en')`, `useAppearance.setState({ language: 'en' })`); `afterEach` restores mocks — prevents cross-test leakage through the shared i18n singleton and zustand store. Import via `@/` alias — jest-safe (precedent: `lib/__tests__/riderSocket.test.ts:23` imports a zustand store through the alias, also proving zustand modules load under jest-expo). NOTE: `i18n.changeLanguage` resolves through a promise chain even with bundled resources — `applyLanguage`/`toggleLanguage` are void, so flush a macrotask (`await new Promise(r => setTimeout(r, 0))`) before asserting `i18n.language`:
  - `toggleLanguage()` from `en` → i18n.language `bn`, AsyncStorage key `ride:i18n:language` = `bn`, `useAppearance.getState().language` = `bn`; and back `bn` → `en` (round-trip).
  - `applyLanguage('bn')` with `setItem` REJECTING → `i18n.language` still `bn`, zustand mirror still `bn`, no unhandled rejection (D2 hardening).
  - `initI18n()` with stored `bn` → i18n `bn` AND zustand mirror `bn` (D3); with garbage stored → `en`.
  - Structural scans (i18n-smoke style, file reads): `app/(auth)/_layout.tsx` contains `LanguageToggle`; `components/GlobalActionButtons.tsx` contains `LanguageToggle`; `components/LanguageToggle.tsx` calls `toggleLanguage`; both settings screens reference `applyLanguage` — guards against accidental unmounting/un-repointing.
- Existing suites unchanged-green (notably `i18n-smoke` — no new `t()` keys, so no locale edits).

**Device verification (execbro, per AGENTS.md; run `node scripts/dev-env-sync.js` first):**
- Button visible: auth screen, customer home, driver home (stack shows 3 buttons; drag the stack; cached position restores after remount).
- No overlap: auth (beside theme toggle), driver-home header cluster untouched.
- One tap on customer home: `t()` strings flip immediately AND vehicle-category pills flip (zustand mirror proof — the two screens that were stale before).
- Same pill-flip check after switching via EACH settings screen (Decision B repoint) — AND the floating toggle's own label flips in the same beat (its data source is `i18n.language` via useTranslation; react-i18next's re-render contract — not jest-testable without RNTL, hence device-level).
- Metro reload → language retained (both stores persisted).
- "বাং" legible (system fallback), light+dark.
- TalkBack/VoiceOver: tap announces "Switch language" and the result is unambiguous from the flipped UI. Static label stays (GAB precedent, D8); if device review shows ambiguity, the one-line fallback is a target-aware label (`Switch language to Bangla/English` — still no locale keys), NOT an `accessibilityLiveRegion` mechanism.
- If execbro/device unavailable: state so in the report; code-trace + gates remain the floor.

## 5. Gates (all must pass, in order)

1. `npm run lint` — 0 errors (283 pre-existing warnings unchanged)
2. `npx tsc --noEmit` (root) AND `cd utils-server && npx tsc --noEmit` — 0 errors both packages
3. `npm run check:vacuous` — clean
4. `npx jest --watchAll=false` — ≥2048 passing, 0 new failures
5. `npm run check:web-imports` — 0 risky (baseline 14 safe)
6. Commit-time greps: no `console.log` in touched files; no clerk/stripe/firebase
7. Bundle: no new deps/assets — size-audit baseline not regressed (one small module ≈ +2–4 KB source; HBC delta negligible)

## 6. Risks & rollback

| Risk | Mitigation | Rollback |
|---|---|---|
| GAB stack geometry regression (3-button drag/clamp/cached offset) | Top placement preserves existing button positions; existing clamp logic reused; device-verify drag | Revert GAB hunk only (single file) — auth mount + helper survive independently |
| Boot mirror-sync race (persist overwrite) | Theoretical; worst case = pre-feature behavior; next tap re-syncs | Drop the one-line sync in `initI18n` |
| Bengali glyph fallback in Jakarta circle | Established behavior (bn locale renders under Jakarta today); cosmetic only | n/a |
| Toggle label may flash "বাং" → "EN" during cold start (sync init = en, async hydration applies stored bn) | Effectively invisible on native: the AsyncStorage read resolves in milliseconds while `SplashAnimation` still covers the screen (splash hides only after auth+fonts, `app/_layout.tsx:357-364`); zustand mirror rehydrate is equally async so it cannot narrow the window either. Pre-existing for ALL translated strings; not a regression. Contingency (do NOT pre-build): if ever user-reported, gate LanguageToggle's render on `i18n.isInitialized` (i18next instance property) — one line | n/a |
| Full-screen Modals (offer sheets) cover the button | Same as theme toggle today; accepted | n/a |
| Scope creep under freeze | No dep changes, no locale keys, no native/config changes; `react-native-otp-verify` untouched (KEEP ruling) | 2 new + 5 touched files; single revert commit |

**Rollback granularity:** (a) GAB stack member, (b) auth mount, (c) `applyLanguage`/`toggleLanguage` + boot sync (restores prior `setLanguage`), (d) settings-screen repoints — each independently revertible; no schema/API/env changes; stored values (`ride:i18n:language`, `appearance-storage.language`) both pre-exist this feature.

## 7. Out of scope (explicit)

- `track/` public screens, `+not-found`, web admin — no floating toggle.
- Any i18n key additions; any font/asset changes; any dependency change.

## 8. Round-verification log

*(implementer appends: what was implemented, files changed, test/gate results, device-verification outcome, deviations)*
