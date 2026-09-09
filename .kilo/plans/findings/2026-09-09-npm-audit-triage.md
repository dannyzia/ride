# npm Audit Triage — 82 findings (1 critical, 24 high) from the workspace clean install

**Purpose:**     Classify the 82 npm audit findings surfaced by the first clean `npm ci` (workspace conversion, `b346ec4`) into exploitable-at-runtime vs dev-only, with a concrete upgrade/override/suppression plan per finding. Read before touching dependency versions.
**Owner:**       Orchestrator (triage); Zia rules on the two gated calls
**Status:**      EXECUTED 2026-09-09 — cheap-kills batch sanctioned by Zia and landed (see EXECUTION LOG at bottom); remaining dispositions unchanged
**Source of truth:** this file for dispositions; raw data in the audit JSON (regenerable via `npm audit --json`)
**Related (concrete paths):**
  - `package.json` — workspace root; where `overrides` and dependency bumps land
  - `utils-server/package.json` — workspace member (own deps, audited in the same tree)
  - `.github/workflows/ci.yml` — where `audit -audit-level=critical || exit 0` + daily scheduled scan land after disposition
  - `.kilo/plans/active-lanes.md` — round ledger
**Last verified:** 2026-09-09 by orchestrator (live `npm audit --json` + `npm ls` + `npm view` at HEAD `49fe1b3`)
**How to update:** re-run `npm audit --json` after any dependency change; append dated rows, never edit old ones.

## 1. Totals

82 findings across 80 unique packages: **1 critical, 24 high, 56 moderate, 1 low**. `npm audit fix --dry-run` fixes **0 without semver-major bumps** — every fix path here is deliberate, not automatic.

## 2. The one genuine runtime exposure — ACTION REQUIRED

**drizzle-orm < 0.45.2 — HIGH — SQL injection via improperly escaped SQL identifiers (CWE-89). Direct dependency, loads in both production processes.**

- **Reachability today: LOW but nonzero.** Repo-wide grep for `sql.raw` / `sql.identifier`: exactly **one** site — `utils-server/scheduler.ts:159` `SET LOCAL statement_timeout = ${budget}` — an internal numeric budget, not attacker-controlled. No dynamic identifiers anywhere else; all queries use parameterized drizzle builders.
- **Why fix anyway:** the advisory class is "future code that interpolates an identifier gets injected." Both the API and the dispatch server import drizzle at startup. This is the only finding where vulnerable code *ships in the app*.
- **Fix:** `drizzle-orm ^0.42.0 → 0.45.2` (patch-minor semantics; drizzle treats 0.x minor as patch per ^0.x resolution). **`drizzle-kit` has ZERO coupling to drizzle-orm** (verified: no peerDependency, no dependency, no engines entry) — so no tooling-side compatibility question exists. Drizzle docs also advise installing the newest `drizzle-kit` alongside. Gates (full suite + tsc both packages) decide; if a minor bump breaks anything, abort and record.
- **Influence:** none of the Z2/WS-emit tests or Phase A/B tests pin drizzle internals; the repo pins nothing on drizzle behavior beyond the query builders.

## 3. Runtime-package high/critical findings — all via dev-only roots

**tar ≤ 7.5.20 — CRITICAL (arbitrary file read/write via symlink-chain extraction, CWE-22/59).**
Pull chain: `eas-cli@19.1.0` (dev) AND `expo → @expo/cli` (dev dependency of the Expo app; never bundled into the JS runtime payload). Exploit vector: malicious tarball extraction — an attacker must already control an npm tarball being installed (i.e., the developer's machine during `npm install`), not the app. **Dev-only, developer-machine risk.** A patched release exists: `tar 7.5.22` (fix available, both consumers satisfy caret-7). **Disposition: `overrides.tar = ^7.5.22` — the critical dies cheap.**

**eas-cli ≥ 0.1.0-alpha.10 — HIGH (umbrella via 16 transitive deps: node-forge, minimatch, @xmldom/xmldom, nanoid, uuid, diff, joi, yaml, ajv…).**
`eas-cli@19.1.0` is a **direct devDependency**, pinned by the HARD CONSTRAINT (`EAS Build/Submit` only, no local builds). Exploit vectors are build-time (malicious app config/plist parsing, malicious project payloads) — requires running EAS against attacker-controlled inputs. The audit's own `fixAvailable: eas-cli@0.52.0` is a **reResolution artifact**, not a real version — actual latest is `eas-cli@23.2.0`. **Disposition: upgrade `eas-cli ^19.1.0 → ^23.2.0` at the next planned build cycle** (pre-release), test with `eas build --profile preview` on a staging profile first; accept residual until then.

**react-native 0.79.2 chain — HIGH (metro/image-size DoS via `@react-native/community-cli-plugin`).**
image-size infinite-loop DoS parsing a malicious ICNS/JXL/HEIF **image file**; vector requires feeding a crafted image to Metro's asset pipeline during bundling. Metro never runs in production; bundling happens on the dev machine / EAS build servers. `fixAvailable: react-native@0.86.3` — an SDK-crossing upgrade (Expo 53→57 cascade, pre-device-test = the one upgrade the plan explicitly gates). **Disposition: accept; fold into the next planned Expo SDK upgrade. Do NOT force it now.**

**postcss ≤ 8.5.22 — HIGH (XSS via unescaped `</style>`; arbitrary file read via attacker-controlled sourceMappingURL).**
Pull chain: `expo → @expo/metro-config → postcss@8.4.49` and `tailwindcss → postcss-* → postcss@8.4.49`. Both consumers are **build-time only** (NativeWind/tailwind CSS pipeline; Metro dev server). The XSS vector needs a browser to render unescaped output from a *build tool*; the file-read vector needs attacker-controlled CSS source comments reaching the dev-time pipeline. No server-side postcss anywhere. **Dev-only.** Patched `postcss 8.5.23+` exists (latest 8.5.28); `tailwindcss@3.4.17` accepts `postcss ^8.4.23` (caret). **Disposition: `overrides."postcss" = "^8.5.23"` — cheap and safe, no runtime surface.**

**@react-navigation/native ≤ 7.3.18 — HIGH (via @react-navigation/core + nanoid; fixAvailable: false).**
Direct dependency `7.0.14`, bundled into the app JS payload, **but** the vulnerable code paths are: nanoid used for internal UI-state keys on the UI thread (no attacker control of size input) — the only high-severity finding that ships in the bundle, with **no plausible attacker-reachable path** (no IPC surface feeds crafted inputs into nanoid/core). `fixAvailable: false` = the fix has not shipped upstream. **Disposition: accept + watch (`npm audit` on the scheduled scan); re-evaluate when @react-navigation ships a patched 7.x.**

**nanoid ≤ 3.3.17 — HIGH (infinite-loop DoS with negative size / malicious custom generator; integer overflow).**
Consumers: `@react-navigation` chain (bundled, UI-thread-only, no attacker input), `eas-cli` (dev-only), `expo` (dev-time config gen). **No attacker-controlled call sites.** Patched `nanoid@3.3.18` exists but no consumer satisfies a caret-3 range — **Disposition: `overrides.nanoid = ^3.3.18`** pins all copies to the patched 3.x (safe: no API change within 3.x).

## 4. Dev-only highs killed by the mermaid-mcp-server decision (no action beyond it)

**@narasimhaponnada/mermaid-mcp-server ^1.0.2 — HIGH (via mermaid + puppeteer → extract-zip symlink-traversal).**
Zero references in scripts, CI, or docs — **added at some point as an IDE/MCP helper; it is not used by anything in the repo**. Puppeteer/extract-zip run only if a developer/agent invokes the MCP tool. **Disposition: REMOVE from devDependencies** — kills 6 high findings (mermaid server + @puppeteer/browsers + extract-zip + puppeteer + puppeteer-core + lodash-es) with zero blast radius. A Zia call only because it touches the dev toolbelt.

## 5. Action plan (executed in order, each gated)

| # | Action | Type | Kill count | Gate |
|---|---|---|---|---|
| 1 | Remove `@narasimhaponnada/mermaid-mcp-server` from devDependencies | **Zia call** (dev toolbelt change) | 6 high | Zia sign-off |
| 2 | `overrides."tar" = "^7.5.22"` | cheap override | 1 **critical** | `npm ci` clean + full gates |
| 3 | `overrides."postcss" = "^8.5.23"` | cheap override | 1 high | full gates |
| 4 | `overrides."nanoid" = "^3.3.18"` | cheap override | 1 high (plus moderate copies) | full gates |
| 5 | `drizzle-orm ^0.42.0 → ^0.45.2` | **the one real runtime fix** | 1 high | full suite + tsc both pkgs; abort if broken |
| 6 | `eas-cli ^19.1.0 → ^23.2.0` | dev-dep upgrade (major) | ~4 high | next build cycle (pre-release); staging `eas build` first |
| 7 | react-native/Expo SDK cascade (metro, image-size, @react-native/*) | accept now | ~3 high | next planned SDK upgrade (device-test-gated) |
| 8 | @react-navigation/native | accept + watch | 1 high | upstream patch; scheduled-scan watch |
| 9 | CI: `npm audit -audit-level=critical \|\| exit 0` step + weekly scheduled audit-scan workflow (non-blocking) | process | — | — |

**Remaining ~52 moderates:** all in the same dev-only trees (eas-cli umbrella, Expo dev tooling, jest-expo). No runtime-bundled moderates. No action beyond what the table above already kills; re-check at SDK upgrade time.

**Suppression policy:** NO blanket `npm audit` exit-code suppression. The only sanctioned suppression is the CI step above (advisory, non-blocking at high/moderate; blocking at critical AFTER actions 1–4 land and the count is 0). If any future critical appears with no fix path, the disposition is a same-day Zia flag, not a silent accept.

## 6. What this triage does NOT change

Production runtime JS payload ships: expo/react-native (framework), drizzle-orm (fixed via #5), @react-navigation (accepted, unreachable), supabase-js, zustand, i18next, maplibre, ws, zod — **none of the vulnerable trees except drizzle-orm and the (unreachable) nanoid/@react-navigation code are present in the served app.** The 82-finding headline is a dev-machine surface report, not a production exposure report.

## EXECUTION LOG — 2026-09-09 cheap-kills batch (landed, all gates green)

| Action | Result |
|---|---|
| Remove `@narasimhaponnada/mermaid-mcp-server` | Done — zero code references verified first; `npm ls` empty; kills its 6 highs + puppeteer/extract-zip/lodash-es/@puppeteer/browsers moderates |
| `overrides.tar = "^7.5.22"` | Done — resolved 7.5.22 (eas-cli + @expo/cli consumers both satisfied) |
| `overrides.postcss = "^8.5.23"` | Done — resolved 8.5.28 (range head, ≥ patched floor) |
| `overrides.nanoid = "^3.3.18"` | Done — resolved 3.3.18 (all consumers are 3.x; no 5.x conflict) |
| drizzle-orm 0.42.0 → ^0.45.2 | Done — root + utils-server manifests bumped (workspace single physical copy); the one runtime-relevant HIGH (identifier-injection class) closed |
| **Audit delta** | **82 → 66 findings; critical 1 → 0; high 24 → 14** |
| Gates | eq(col,null) CLEAN · root tsc 0 · utils-server tsc 0 · lint 0 errors (283 warnings, −2) · jest **1995 passed / 2 skipped / 156 suites** (the 3 pre-existing pickup-move failures no longer reproduce) |

Remaining dispositions unchanged: eas-cli upgrade at next build cycle; react-native/Metro + @react-navigation/nanoid accepted (SDK-crossing or unreachable); ~52 moderates re-checked at the SDK upgrade.
