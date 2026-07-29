# Maestro Test Flows — MOVED / SUPERSEDED

This file's original content (the "Prompt for Maestro Test Agent" that generated the
flows) has been removed. It was out of sync with the actual app and is no longer needed.

Use these instead:

- **`maestro/flows/*.yaml`** — the real, code-verified Maestro flow files
  (`auth-flow`, `driver-go-online`, `rider-trigger-ride`, `rider-core`, `driver-core`,
  `driver-onboarding`, `edge-cases`). Each is self-documenting via its header comment
  (device, run command, preconditions).
- **`docs/testing plan/master-testing-prompt.md`** — the corrected system prompt for the
  vision testing agent (two-device end-to-end ride).
- **`docs/testing plan/manual-testing-full-flow.md`** — the operator's screen-by-screen
  walkthrough.

> The removed content described things that do **not** match the code: a BRTA/walkaround
> driver onboarding (that flow is admin-only), Gulshan/Gazipur dropoffs (canonical route
> is Banani → Savar), SMS-OTP login (existing accounts use password login), and tap-based
> slides (they are PanResponder drags). Do not rely on it.

To delete this stub entirely (PowerShell):
```powershell
git rm "docs/testing plan/maestro-full-flow.md"
```
