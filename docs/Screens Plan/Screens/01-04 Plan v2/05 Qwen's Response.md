## 1. IMPLEMENTATION READINESS
**NOT READY** 

The draft prompt suite is exceptionally detailed and well-structured for a skeptic audit. However, it contains hidden traps caused by direct contradictions between the provided Master Plan (`01-04 Plan V2.md`) and the repository's actual source of truth (`AGENTS.md` and `list.txt`). If fed to the auditor agents as-is, they will generate false-positive CRITICAL findings regarding payment gateways, theming patterns, and missing files. Specific precedence rules and clarifications must be injected before execution.

---

## 2. REPOSITORY FACTS
Based on forensic inspection of `list.txt` and `AGENTS.md`:
- **Navigation Architecture**: The repository uses Expo Router `(tabs)` layouts for both Rider (`app/(main)/(customer)/(tabs)/`) and Driver (`app/(main)/(rider)/(tabs)/`). 
- **Payment Gateway**: `AGENTS.md` explicitly states **PortPos** is the unified gateway. `lib/bkash.ts` and `lib/nagad.ts` are inert stubs that throw errors.
- **Theming Contradiction**: `AGENTS.md` states Dark mode is handled by NativeWind `dark:` variants. Master Plan L1 explicitly bans `dark:` classes in favor of Pattern A (`useIsDark()` + inline ternaries).
- **WebSocket Files**: Master Plan references `lib/riderSocket.ts`. This file **does not exist** in `list.txt`. `lib/ws-stub.ts` exists instead.
- **Backend Split**: `utils-server/` is a completely separate package with its own `package.json` and `tsconfig.json`, not just a folder in the Expo app.
- **State Management**: Exactly 7 Zustand stores exist in `store/` (matching `AGENTS.md`).
- **Admin Panel**: `app/admin/` contains ~35 web-only screens.

---

## 3. DEPENDENCY MAP
- **Documentation Precedence**: The auditor agents depend on both the Master Plan and `AGENTS.md`. Where they conflict (Payments, Theming, Navigation), the agents need explicit precedence rules to avoid logic loops.
- **Expo API Routes**: Depend on the `{ id }` direct param convention, NOT the Next.js `{ params }` wrapper.
- **Database**: Drizzle ORM with strict `snake_case` properties and `integer` paisa rules for all `*_bdt` columns.
- **Write Ownership**: `call_ledger` deductions are strictly bound to `utils-server/heartbeat.ts`.

---

## 4. TECHNICAL DEFECTS IN DRAFT PROMPT
1. **Blind Trust in Master Plan File Paths**: Prompt 1 instructs the agent to verify `lib/riderSocket.ts`. Since this file doesn't exist, the agent will flag a false positive or get stuck. It must be instructed to trace the *behavior* (where the rider socket is instantiated) rather than searching for a specific filename.
2. **Unresolved Documentation Conflicts (Theming)**: The prompt tells the agent to "Inspect `AGENTS.md`" and "Treat [Master Plan] as authoritative". When the agent reads `AGENTS.md`'s note on NativeWind `dark:` and Master Plan's L1 banning it, it will experience a logic conflict. 
3. **Payment Gateway Misinterpretation Risk**: Master Plan L16 says "bKash only". `AGENTS.md` says "PortPos unified gateway". The agent will likely flag the entire PortPos integration as a violation of L16, not realizing PortPos is the *processor* for bKash.
4. **Tab Bar vs Hamburger (L11)**: Master Plan L11 says "No bottom tab bar for riders". The repo clearly has `app/(main)/(customer)/(tabs)/`. The agent will flag this as a failure. The prompt should instruct the agent to report this as "Plan vs Implementation Drift" rather than a blind fail, as the implementation may have evolved.

---

## 5. MISSING TECHNICAL INSTRUCTIONS
- **Precedence Rules**: Explicit instructions on how to handle conflicts between `AGENTS.md` and the Master Plan.
- **Admin Panel Scope**: Clarification that `app/admin/` is a web-only panel and should not be audited against mobile futuristic UI constraints (like low-end Android performance or glanceability).
- **Expo Router `(tabs)` Reality Check**: Instruction to acknowledge the existence of `(tabs)` directories and evaluate them as architectural drift rather than immediate code failures.
- **WebSocket Stub Reality**: Instruction to check `lib/ws-stub.ts` or inline socket creation if `lib/riderSocket.ts` is missing.

---

## 6. FILE / MODULE IMPACT
- `app/(main)/(customer)/(tabs)/` vs `app/(main)/(customer)/profile/` (Navigation architecture drift)
- `lib/useAppearance.ts` vs `tailwind.config.js` (Theming pattern conflict)
- `app/api/payment/portpos/callback+api.ts` vs `lib/bkash.ts` (Payment gateway reality)
- `app/(main)/(customer)/services-hub.tsx` (Actual rider socket creation location)
- `utils-server/heartbeat.ts` & `lib/paymentEvents.ts` (Write ownership verification)
- `src/db/schema.ts` (Snake_case, integer paisa, NULL check verification)

---

## 7. EDGE CASES
- **Idempotency in PortPos Callback**: The agent must verify that duplicate PortPos IPNs don't double-credit wallets (a known critical invariant).
- **Stale WebSocket Events**: The agent must check if `ride:completed` or `ride:cancelled` events are safely ignored if the ride state has already moved on.
- **Expo API Param Trap**: The agent must specifically look for the Next.js `{ params }` destructuring bug in Expo API routes, which causes runtime crashes.
- **NULL Checks in Drizzle**: The agent must search for `eq(col, null)` which compiles to `col = NULL` (always false in SQL). The correct pattern is `isNull(col)`.
- **Floating Point Money**: The agent must trace `*_bdt` fields to ensure no `/ 100` happens before the UI display boundary.

---

## 8. TESTING REQUIREMENTS
The auditor agents should verify if the following invariants (from `AGENTS.md`) are covered by tests:
- Single deduction per `(ride_id, driver_id)`.
- `calls_remaining = 0` drivers never in candidate pool.
- Same idempotency key → exactly one `payment_events` row.
- Duplicate callback activates subscription exactly once.

---

## 9. EXACT PROMPT CORRECTIONS

**Add to Prompt 1 (Phase 1 - Reconnaissance):**
> "Precedence Rule: The Master Plan (v3.0) overrides `AGENTS.md` for UI/UX theming (Pattern A vs NativeWind `dark:`). `AGENTS.md` overrides the Master Plan for backend architecture (PortPos vs direct bKash). Report conflicts as 'Documentation Drift'."

**Add to Prompt 1 (Phase 2, L8 - WS Singleton):**
> "Note: `lib/riderSocket.ts` may not exist in the repo. Trace the actual rider WebSocket instantiation (e.g., in `services-hub.tsx` or `lib/ws-stub.ts`). Do not fail the audit simply because the filename differs from the plan; verify the *behavior*."

**Add to Prompt 1 (Phase 2, L16 - bKash only):**
> "Clarification: 'bKash only' means the UI collects only bKash numbers (`^01\d{9}$`). The backend uses PortPos as the unified gateway to process these payments. Do not flag PortPos integration as a violation of L16. `lib/bkash.ts` is an inert stub."

**Add to Prompt 1 (Phase 2, L11 - Navigation):**
> "Note: The repository contains `(tabs)` directories for riders. If a tab bar is present, flag it as a deviation from L11 ('Hamburger > Tab Bar'), but verify if a FAB/Hamburger menu is also present. Report as 'Architecture Drift'."

**Add to Prompt 2 (Phase 8 - API Boundary Audit):**
> "Explicitly search for the Next.js `{ params }` trap in Expo API routes. The correct Expo convention is `{ id }` directly as the second argument. Destructuring `{ params }` will cause a TypeError."

**Add to Prompt 2 (Phase 7 - Repository Hygiene):**
> "Explicitly search for `eq(col, null)` in Drizzle queries. This is a known critical bug pattern; the correct pattern is `isNull(col)` / `isNotNull(col)`."

---

## 10. FINAL TECHNICAL ASSESSMENT
The draft is **highly comprehensive** but **technically unsafe for execution** in its current state. The contradictions between the Master Plan and `AGENTS.md` will cause the auditor models to hallucinate failures or get stuck in logic loops. By injecting the exact precedence rules and reality checks outlined in Section 9, the prompts will become technically sound, resilient to documentation drift, and ready for execution.