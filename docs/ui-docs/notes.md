# Wireframe Documentation — running findings ledger

Owner rulings (2026-08-27): Phase 1 approved · legacy `docs/wireframes/` frozen superseded · repo = source of record (`†` marks runtime-unverifiable) · device baseline Android 13 MR + iOS 16 light/dark (locks at first capture) · **full state depth** · R/D/A/C + suffix grammar approved · every Source field cites file:line · exact physical line counts only.

## Inventory corrections (transparent changelog — numbering untouched)
| ID | Was | Now | Evidence |
|---|---|---|---|
| R-005 | Var `E,X` | `X,L` | `app/(auth)/login.tsx` has no empty-state branch; error inline `:128-135`; button label swap `:137-141` |
| R-007 | Var `E,X` | `X,L` | `phone-entry.tsx` empty-claim came from `"No account found"` string — that is an error message `:57,:96`; busy disables buttons `:212-222` |
| R-006 | primary + `-X` | primary(step-phone) + `.S2`(otp) + `.S3`(password) sub-layouts, all share `-L/-X` | 3 rendered layouts in one route, heading/subcopy/input/action all swap `:166-303` |

## Batch 1 findings (rider-auth)
1. **Welcome "Create Account" duplicates Sign In**: both buttons route to `/(auth)/phone-entry` (`welcome.tsx:64-72`). Existing/new-user branching happens downstream in phone-entry via `/api/auth/check-user`. Quirk recorded; not a v6 item.
2. **OTP field is a single 10-digit-capable text input capped at 6** — no six-box segmented UI anywhere (`otp-verify.tsx:125-137`, also reused pattern in forgot-password `:221-230`).
3. **Register routes by role** created earlier at phone-entry pill: driver → `/(main)/(rider)` immediately; rider → `enable-location` (`register.tsx:81-85`) — implies driver has NO location/notif permission screens in practice despite `(auth)/driver-*` twins existing. Driver-auth EPs flagged `†` for verification in their batch.
4. **Post-permission landing is Services Hub, not Home** (`notifications-permission.tsx:74-78`, comment "L12"). Affects R-013 EPs across docs.
5. **Auth redirects rely on layout gate, not manual navigation** (`login.tsx:60`) — error-vs-success separation is via root redirect.
6. forgot-password success returns to **login prefilled with the phone** (`forgot-password.tsx:152`), no dedicated success page.

## Line-count discipline
inventory file = **127 physical lines** ((Get-Content).Count) — owner corrected the assistant's "96".
