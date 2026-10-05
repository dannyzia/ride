**Purpose:**     Record of the 2026-10-04 i18n orphan resolver extension — imported key tables, iteration-callback parameter bindings, transitive const chains — and its before/after measurements.
**Owner:**       Testing/QA tooling (maintainer of `scripts/audit-i18n-orphans.cjs`)
**Status:**      ACTIVE
**Source of truth:** `scripts/audit-i18n-orphans.cjs` — the resolver itself; this file is the dated record of the change, not the mechanism.
**Related (concrete paths):**
  - `scripts/audit-i18n-orphans.cjs` — the resolver (its CARRIER SHAPES section documents the new tiers)
  - `tests/meta/audit-i18n-orphans.test.ts` — its proof suite (38 tests; fixture + fault pair per tier, real-tree pins)
  - `scripts/i18n-orphan-baseline.json` — the gate ratchet; the orphan list is unchanged by this extension
  - `docs/testing plan/reports/I18N-ORPHAN-AUDIT-2026-10-04.md` — the audit run before the extension (236 orphans / 133 shielded / 21 unresolved)
**Last verified:** 2026-10-04 — `node scripts/audit-i18n-orphans.cjs --json` exit 0 and `node scripts/audit-i18n-orphans.cjs --gate` exit 0 on the extended resolver.
**How to update:** re-run the two commands above and update the tables; numbers are one run, never hand-edit individual keys.

---

# i18n orphan resolver extension — 2026-10-04

## What was added

| Tier | Shape | Resolution |
|---|---|---|
| Imported key tables | `t(TABLE[k])` where `TABLE` is imported | resolve the specifier (`./x`, `@/x`) → parse the target module on demand → follow its EXPORTED `const` initializer (a module only contributes what it exports) |
| Callback-parameter bindings | `ARR.map((p) => t(p.key))` / `t(p)` | bind the callback's first parameter to the elements of `ARR` when `ARR` resolves to an array literal (inline, local const chain, or imported table); collect only the property the call actually reads |
| Const chains | `const key = TABLE[x]; t(key)` | identifiers inside an initializer resolve one hop further, cycle-guarded by module + name |

Accepted iteration methods: `.map`, `.flatMap`, `.forEach`, `.filter`, `.some`, `.every`, `.find`,
`.findIndex` — `.reduce` and `.sort` are excluded (their first parameter is not an element).

Every dynamic site now carries an `evidence` list (`local`, `import:<spec>`,
`callback:<method>`) naming what resolved it, so a resolution regression shows up as an empty list
rather than as silence.

## Before / after (real tree)

| Metric | Before | After |
|---|---|---|
| Unresolved dynamic sites | 21 | **10** |
| File-fallback-shielded keys | 75 | **41** |
| Shielded keys | 133 (dynamic-table 58 + overlaps) | 133 (dynamic-table 86, file-fallback 41, template-prefix 6) |
| Orphans / baseline | 236 | 236 (unchanged — the gate stayed green) |

## Remaining unresolved classes (10 sites)

Render-prop destructuring (inbox ×2), same-file helper parameters (contact-support, faq ×2,
notifications ×2), useState-derived keys (services-hub), a member of an object built by `reduce`
(rider/settings), and a call-result property (wallet). Each keeps the per-file fallback, so none
can become a false orphan.

## Proof

- `npx jest tests/meta/audit-i18n-orphans.test.ts` — **38 passed**. One fixture + fault pair per
  new tier: with import resolution off the imported keys orphan; with callback binding off the
  shield reason flips from `dynamic-table` back to `file-fallback`; with const-chain following off
  `const key = TABLE[x]` degrades to unresolved. The pre-existing fallback fixture was reshaped to
  a callback the binder genuinely cannot resolve (a component prop), so the fallback tier keeps its
  own proof.
- The real-tree test pins `scan.unresolvedDynamic = 10` (was 21) in addition to the baseline sync,
  so a resolution regression cannot pass as "still works".

## Same-day follow-up — the purge

Later on 2026-10-04 the 106 confirmed orphans of the deleted screens were purged from both locales
and from the baseline (236 → 130 entries) via `scripts/purge-orphan-keys.cjs`, which the gate's
failure message now points at. The post-purge run reports **130 orphans / 133 shielded**, with the
resolver numbers above unchanged (10 unresolved, 41 file-fallback); MISSING and PARITY remain
empty. The deletion-time procedure is §Deleting a screen of `docs/testing plan/reports/DEAD-SCREEN-AUDIT-2026-10-04.md`.
