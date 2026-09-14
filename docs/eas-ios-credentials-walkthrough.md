# EAS iOS Production Credentials — Owner Walkthrough

**Purpose:**     One-time setup so `eas build --platform ios --profile production` can be queued. Zia performs the Apple/interactive steps; any agent can then queue builds.
**Owner:**       Zia (Apple ID / ASC actions) · Orchestrator ( upkeep of this doc)
**Status:**      ACTIVE — ready to execute
**Source of truth:** this file for the setup sequence; Expo CI docs (`docs.expo.dev/build/building-on-ci/`) for the env-var contract
**Related (concrete paths):**
  - `eas.json` — `requireCommit: true`, production profile (store distribution, `EXPO_WEB_OUTPUT=single`, 2560MB heap)
  - `app.config.js:41-48` — `ios.bundleIdentifier: "com.ride.bd"`; `:104` — EAS projectId `3293078f-…`
  - `.kilo/plans/active-lanes.md` — ledger rows for the EAS failure chain (65877413 → f4f03091 FINISHED 2026-09-14, the Android production proof) and ISSUE-45 (board record)
**Last verified:** 2026-09-14, by coding agent (live `eas credentials` probe + verbatim error capture)
**How to update:** after credentials exist, flip Status to DONE and record the build ID here and in the ledger.

---

## 0. Current state (verified 2026-09-14)

| Item | State |
|---|---|
| EAS login | `digital-papyrus` (live) |
| Android production | **DONE** — build `f4f03091` FINISHED (free medium resource class) |
| iOS credentials | **NOT SET UP** — EAS build attempt stopped at: "distribution certificate isn't set up and validation requires interactive mode" |
| Blocker class | Apple-side auth only; no repo/config change needed |

Two proven paths exist. **Do exactly one** of Step 2A or 2B, then Step 3.

---

## 1. Clean the working tree (required by `requireCommit: true`)

EAS refuses to start with a dirty tree — verified verbatim: *"Commit all changes. Aborting..."* (fires **before** credential validation).

1. Commit or stash all residue (`git status --porcelain` must be empty).
2. Known pending items at time of writing: `.audit/` deletions + `docs/size-audit.md` edit (parallel session), `.kilo/plans/active-lanes.md` (ledger rows).

---

## 2A. Path A — one-time interactive credential creation (RECOMMENDED, ~5 min)

One Apple ID login on this machine; EAS stores the credentials server-side. After this, every future build — including CI and `--non-interactive` — needs **no** Apple auth (only credential *repair* ever needs the ASC API key from Path B).

```powershell
npx eas credentials --platform ios
```

Prompts (in order):
1. **Build profile** → `production`
2. **Apple ID + password + 2FA code** → the account in the `digital-papyrus` team's Apple Developer Program
3. **Select or create Distribution certificate** → accept EAS creating a new one (or pick an existing if the team has one)
4. **Select or create Provisioning profile (store)** → let EAS create it for `com.ride.bd`

Success looks like: credentials listed with no further prompts. Verify:

```powershell
npx eas credentials --platform ios   # should now list Distribution cert + profile without prompting
```

## 2B. Path B — fully non-interactive via App Store Connect API key

Use only if the Apple ID login is not possible (e.g. delegating to an agent/CI). Creates the same credentials via the ASC API.

1. **Create the API key** (appstoreconnect.apple.com):
   - Users and Access → **Integrations** tab → App Store Connect API → Team Keys → **Generate API Key**
   - Role: **App Manager** (sufficient for cert/profile management)
   - **Download the `.p8` once** — it is never re-downloadable. Save it OUTSIDE the repo, e.g. `C:\Users\callz\.apple\AuthKey_XXXXXXXXXX.p8`
   - Note the **Key ID** (10 chars, shown next to the key) and the **Issuer ID** (UUID, top of the Integrations page)
2. **Gather the Apple Team ID** — Apple Developer → Membership details (10 chars). Team type is `COMPANY_OR_ORGANIZATION` or `INDIVIDUAL` (NOT `IN_HOUSE` unless enterprise).
3. **Set the env vars in the SAME shell, then queue** (PowerShell):

```powershell
$env:EXPO_ASC_API_KEY_PATH = "C:\Users\callz\.apple\AuthKey_XXXXXXXXXX.p8"
$env:EXPO_ASC_KEY_ID       = "XXXXXXXXXX"
$env:EXPO_ASC_ISSUER_ID    = "<issuer-uuid>"
$env:EXPO_APPLE_TEAM_ID    = "<10-char-team-id>"
$env:EXPO_APPLE_TEAM_TYPE  = "COMPANY_OR_ORGANIZATION"

npx eas build --platform ios --profile production --no-wait
```

EAS uses these to create the distribution certificate + provisioning profile without any Apple ID login. The env vars are read per-invocation — nothing is written to disk or the repo.

### Security rules (non-negotiable)
- The `.p8` key is a **full ASC credential**: NEVER commit it, never put it in `.env.local`, never paste it into chat. It lives only on the owner's disk.
- Revoke anytime at ASC → Integrations → Team Keys (kills agent access instantly).
- If CI ever needs iOS builds, transfer via `eas secret:create` — never via git.

---

## 3. Queue and verify

```powershell
npx eas build --platform ios --profile production --no-wait
```

- `requireCommit` must pass (Step 1) — tree clean.
- `--no-wait` returns the **build ID** and dashboard URL immediately; queued is fine.
- Report the build ID back; the standard failure chain watch applies (EAGER_BUNDLE memory is already fixed: `EXPO_WEB_OUTPUT=single` + 2560MB cap in `eas.json` production env).

Verify state non-interactively afterwards:

```powershell
npx eas build:list --platform ios --limit 1 --non-interactive
```

---

## Known limitations
- Free EAS plan: iOS builds also run on the medium resource class; the `EXPO_WEB_OUTPUT=single` fix applies to both platforms (already in the profile).
- First iOS build may take longer than Android (Xcode toolchain) — queued/started state is expected for a while.
- If the Apple Developer account has no iOS device registration requirement for store distribution, none is needed — store profiles are device-free.
