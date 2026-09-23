# Bengali Numerals + Taka Display Consolidation

You are an expert RN/Expo engineer on this codebase. Read AGENTS.md first (binding).
**This work is authorized by Zia (feature-freeze lift for this item).** Create/claim
the Rhizome issue before editing.

**Ground truth (verified 2026-09-14, amended 2026-09-17 after critique — re-verify
with grep before relying on it):**
- `lib/format.ts` is the canonical formatter: `formatBDT(paisa, { decimals })`,
  `formatDate`, `formatDateTime`, `formatRelativeTime` — all bn-BD Intl with
  `numberingSystem: "latn"` pinned and `Asia/Dhaka` timezone.
- ~79 inline money JSX sites bypass it (67 in app/, 12 in components/). NOT all
  are paisa — see the paisa-vs-taka heuristic in Phase 3.
- Variant shapes exist beyond `৳{(x / 100).toFixed(N)}` — the sweep must also
  catch: `(x / 100).toLocaleString("en-BD")` local helpers (4 fleet screens:
  `(fleet)/trips/[id].tsx:18`, `(fleet)/subscription.tsx:59`,
  `(fleet)/(tabs)/finance/trips.tsx:37`, `(fleet)/(tabs)/finance/index.tsx:25`),
  `Math.round(v / 100)` chart `formatValue` (`performance-stats/index.tsx:138`),
  and template-literal usage in `Alert.alert` (`find-customer/index.tsx:110`)
  and `promos/index.tsx:169,211`.
- Language source of truth: **i18next only.** BOTH language screens write
  `setLanguage` from `i18n/i18n.ts` (AsyncStorage `STORAGE_KEYS.LANGUAGE` +
  `i18n.changeLanguage`): rider `app-language/index.tsx:93`, driver
  `(rider)/settings/language/index.tsx:37`. `useAppearance.language` is DEAD
  state — nothing ever writes it; its only readers
  (`services-hub.tsx:22`, `(tabs)/home/index.tsx:100`) always receive `'en'`.
  Never source language from `useAppearance.language`.

**Start by listing every file you will touch.**

## Phase 1 — Extend `lib/format.ts` (behavior-identical, no visual change)
1. Add `numberingSystem` support to `formatBDT`: new opt
   `{ numbering?: "latn" | "beng" }`, default `"latn"` — output for every
   existing caller must be byte-identical after this change.
2. Prefer Intl's native `"beng"` (gives correct lakh grouping ১,২৩,৪৫৬) over a
   manual digit map. BEFORE writing any fallback: device-verify with ExecBro or
   emulator that
   `new Intl.NumberFormat("bn-BD", { numberingSystem: "beng" }).format(1234567)`
   returns **`"১২,৩৪,৫৬৭"`** on Hermes — i.e. assert BOTH Bengali digits AND
   lakh grouping (not just digits; Hermes may render digits but fall back to
   Western grouping `123,456`, which defeats the purpose). The "latn" variant
   already works in production code, so the API path is proven.
3. Only if "beng" digits or grouping fails on-device: add the 12-line
   `toBengaliDigits` fallback map to the same file, with a JSDoc on it AND on
   `formatBDT` stating: "Fallback activates ONLY when on-device ICU data lacks
   beng numbering (digits or lakh grouping) — it is NOT a general polyfill;
   with full ICU the native path always runs. It converts digits only —
   grouping remains Western (123,456), not lakh (1,23,456)."
4. Unit tests in `tests/lib/format.test.ts`: both numbering systems with
   EXPLICIT grouping assertions
   (`formatBDT(123456700, { numbering: "beng" })` → `"৳১২,৩৪,৫৬৭"`), decimals
   0/2, negatives, null/undefined/NaN → "—". Real assertions (vacuous gate).
   Note: Node/Jest has full ICU, so CI tests prove the Intl path; the Hermes
   device check in step 2 is the separate production gate.

## Phase 2 — Preference plumbing (no visual change yet)
1. Add `bengaliNumerals: 'auto' | 'on' | 'off'` to `useAppearance` (zustand
   persist), default **`'auto'`**. Rationale (critique resolution): zustand
   persist writes the FULL state on the first `setTheme`/`setLanguage` call —
   a boolean `false` default would be baked into AsyncStorage for every user,
   silently defeating the Phase 4 flip. Tri-state keeps "unset" distinguishable
   from "explicitly off" forever.
   - In Phases 2–3, `useTaka()` interprets `'auto'` as **latn** (no visual
     change). Phase 4 reinterprets `'auto'` — one line, Zia-gated.
   - Explicit `'on'`/`'off'` set by the user is NEVER overridden by any phase.
   - Keep the name `bengaliNumerals` (do NOT rename to `...ForTaka`); JSDoc on
     the hook states: "Currently applies to taka formatting only; dates and
     relative time intentionally remain Latin-digit (see follow-ups)."
2. Add `useTaka()` hook in **`lib/useTaka.ts`** (definitive home — do NOT put
   the hook in `lib/format.ts`; that module stays React-free so its unit tests
   and non-React importers carry no React/zustand/i18next weight; precedent:
   `lib/useAppearance.ts` is its own file). Phase 2–3 shape: reads
   `useAppearance((s) => s.bengaliNumerals)` (selector, avoids re-renders),
   resolves `'auto'` → latn, explicit on/off → beng/latn; returns
   `(paisa, opts?) => string` delegating to `formatBDT` with
   `numbering: "beng"` iff effective pref is on. Hook wrapper only; pure
   function stays primary. `formatBDT` itself NEVER reads the pref. The
   `useTranslation()` language subscription is deliberately DEFERRED to the
   Phase 4 flip commit — it is the only place language becomes load-bearing,
   so Phases 2–3 carry no redundant language read.
3. Toggle UI in the rider app-language settings screen (and the driver
   `settings/language` screen for parity): a Switch bound to the EFFECTIVE
   boolean; onChange writes explicit `'on'`/`'off'`. Labels in BOTH
   `i18n/locales/en/common.json` and `bn/common.json`. Copy Truth: pre-flip
   copy says only "Show Bengali numerals (০–৯) for taka amounts" — do NOT
   mention "follows app language" until Phase 4 makes that live.
   Validation: toggle the pref, kill & restart the app, confirm the choice
   survived (end-to-end proof that zustand persist → AsyncStorage wrote it,
   and that `i18n.changeLanguage` persistence via `STORAGE_KEYS.LANGUAGE`
   round-trips for the language side).
4. Language for any future default derivation comes from `i18n.language`
   (i18next), NEVER `useAppearance.language` (dead field — see ground truth).

## Phase 3 — Migrate inline sites (behavior-identical sweep)
1. Paisa-vs-taka heuristic (concrete, per-site):
   - **Migrate** (paisa domain): the value is divided by 100 in the expression —
     `৳{(x / 100).toFixed(N)}` → `formatBDT(x)` / `formatBDT(x, { decimals: true })`
     preserving the decimal count EXACTLY; likewise `(x / 100).toLocaleString(...)`
     local helpers and `Math.round(x / 100)` display sites.
   - **Skip** (taka domain): NO `/100` division — `৳{preset}` (top-up presets,
     `top-up/index.tsx:74`), `৳{item.fare}` (`RiderRidesItem.tsx:118`),
     `৳{systemBdt}`/`৳{currentBdt}` (`MinRateSlider.tsx:58`).
   - Mixed files exist: `MinRateSlider.tsx` has both shapes — migrate only the
     `/100` lines (77, 80), leave line 58 alone.
   - When unsure at a site, trace the value's origin one level up; if it is a
     `*_bdt` paisa int from the API, migrate; if a pre-divided taka number or a
     user-entered amount, skip. Record skips in the Rhizome attempt note.
2. SKIP categories (Latin digits always, never converted): `app/admin/**` web
   screens (English UI), taka-domain sites above, phone numbers, OTP codes,
   ride IDs. Note: phone/OTP/ride-ID sites are STRUCTURALLY excluded by the
   `/100` heuristic (none of them divide by 100) — this list is a guard
   against overzealous "convert all digits" expansion, not something to
   regex-hunt for. Identify them by variable/context if encountered, not by
   pattern matching. Fleet MOBILE screens (`app/(main)/(fleet)/...`) are in-app money
   displays — migrate their `/100` sites to `formatBDT`, replacing their local
   `toLocaleString("en-BD")` helpers.
3. Where admin-local helpers exist (`fmtBdt` in zone-pnl) leave admin alone;
   migrate only rider/driver/fleet-facing screens.
4. Verify per-screen: tsc + ExecBro screenshots (if available) on THREE rider
   screens (confirm-ride, find-ride or ride-tracking, top-up) and THREE driver
   screens (finish-ride, earnings, packages) in BOTH `en` and `bn` locales —
   all must be pixel-identical to pre-migration (latn everywhere).
5. Admin guard: after the sweep, assert with grep that `app/admin/**` contains
   zero `useTaka` imports and zero `numbering.*beng` usage (admin is
   web-only — ExecBro cannot reach it — so the deterministic grep is the
   check, plus a manual browser spot-check of 2 admin money screens
   (zone-pnl, packages) if any doubt remains).
6. Full gates in order, all green: `npm run lint` → `npx tsc --noEmit` →
   `npm run check:vacuous` → `npx jest --watchAll=false` (floor: 2035 green).

## Phase 4 — Flip the default (separate commit, owner-approved)
Requires Zia's explicit go-ahead — the current `"latn"` pin was a deliberate
prior decision; reversing it is his call, recorded as a Rhizome decision.
Mechanics (critique resolution — explicit):
- The flip is EXACTLY ONE semantic change: `useTaka()` interprets `'auto'` as
  "follow `i18n.language`: bn → beng, en → latn" — this commit ADDS the
  `useTranslation()` subscription to the hook (deferred from Phase 2; it is
  the only place language becomes load-bearing). No storage migration, no
  one-time write, no override of explicit `'on'`/`'off'` values — users who
  toggled keep their choice; only never-toggled users (and new installs) get
  the language-following default.
- Ties to the user's PERSISTED i18n language (AsyncStorage via i18next), not a
  transient in-memory value — no flicker on temporary switches.
- Copy Truth update allowed at flip time: the toggle caption may now say the
  default follows app language.
- Ship in a separate commit so it is independently revertable.

## Follow-ups (create Rhizome issues BEFORE closing this work; do NOT build)
- `formatRelativeTime` outputs English ("5m ago") even in bn — i18n-aware
  relative strings (prevents ৳১০০ + "5m ago" fragmentation).
- Delete the dead `useAppearance.language` field + `setLanguage` action and fix
  its two readers (`services-hub.tsx:22`, `(tabs)/home/index.tsx:100`) to use
  `i18n.language`. (This replaces the old "consolidate dual stores" follow-up —
  ground truth shows one side is dead, not dual-live.)
- Date formatting is NOT missing — `formatDate`/`formatDateTime` already do
  bn-BD; do not rebuild them.

## Critique disposition
**Round 1 (2026-09-17).** Accepted and folded in: Hermes grouping assertion
(P1.2/P1.4), fallback JSDoc limitation (P1.3), tri-state pref + flip mechanics
protecting explicit user settings (P2.1/P4), language source pinned to i18next
after dead-field discovery (P2.4), concrete paisa-vs-taka heuristic + variant
shapes (P3.1), expanded screenshot matrix (P3.4), follow-ups pre-registered
(above). Rejected: renaming `bengaliNumerals` → `bengaliNumeralsForTaka`
(JSDoc scope note instead); deferring dual-store consolidation BEFORE Phase 4
(moot — the field is dead; `i18n.language` is the single live source).

**Round 2 — Kimi K3 (2026-09-17).** Accepted: fallback JSDoc now states the
activation condition (ICU-missing only, not a polyfill — P1.3); definitive hook
home pinned (P2.2); admin unaffected-ness verified via deterministic grep guard
(P3.5, adapted from the suggested screenshots because admin is web-only and
ExecBro cannot reach it); skip categories clarified as structurally excluded by
the `/100` heuristic (P3.2); explicit toggle-restart persistence validation
(P2.3). Partially accepted: the `useTranslation()` read is indeed redundant in
Phases 2–3 — deferred to the Phase 4 flip commit where it is load-bearing,
rather than removed outright (it is required there to resolve `'auto'`).
