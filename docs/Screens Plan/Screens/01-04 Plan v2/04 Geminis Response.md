Viewed Code%20Skeptic%20Audit%20Prompt%20for%20Plan%2001%20-%2004.md:1-800
Viewed 01-04%20Plan%20V2.md:1-800
Listed directory docs
Viewed 01-04%20Plan%20V2.md:1-800
Viewed 01-04%20Plan%20V2.md:790-871
Searched for "dark mode is handled by NativeWind"
Ran command: `echo "Auditing complete"`

## 1. SYSTEM-LEVEL VERDICT

**SAFE AFTER CORRECTIONS**

The Draft Kilo Prompt adopts an excellent skeptical posture, but it is currently unsafe because it treats the `Master Plan` as the absolute ground truth over the actual repository state documented in `AGENTS.md`. If executed as-is, the agent will flag correctly implemented repository patterns as bugs (especially regarding theming and API parsing) and will miss critical backend invariants (dispatch constraints, money exceptions, timezone boundaries) uniquely specified in `AGENTS.md`.

## 2. SYSTEM ARCHITECTURE IMPACT

The prompt ignores the repository's graph-based architectural discovery requirement. By failing to enforce `codebase-memory-mcp` usage for reconnaissance, the agent will likely use brute-force `grep` or file reading, leading to incomplete conclusions and violating a global user rule. Furthermore, the prompt's failure to audit the `platform_config` dynamic loading pattern and the `vehicle_type` scoping logic means major pillars of the architecture will go unverified. 

## 3. CROSS-MODULE DEPENDENCIES

The prompt misses important dependencies:
- **Vehicle Type Scoping:** The constraint tying `drivers.vehicle_type` to `packages.vehicle_type`.
- **Payment Compensation:** The worker queue dependency that handles failed PortPos activations (`compensation_queue` entry within 30 seconds).
- **Write Ownership:** The prompt correctly identifies `call_ledger` deductions but fails to map the cross-module write ownership for `call_ledger` refunds (`utils-server/heartbeat.ts`), `dispatch_offers`, and other `payment_events` state transitions (`lib/activateSubscription.ts`).

## 4. DATA / API / STATE IMPACT

The prompt will lead to incorrect evaluations of API and data contracts:
- **API Parsers:** It will falsely flag bodyless POST endpoints (e.g., `/auth/logout`) for missing `parseJsonBody`.
- **Database Schema:** It will falsely flag `rate_percent` columns (`numeric(5,2)`) as violations of the "integer paisa" rule.
- **State Logic:** It misses the UTC boundary constraints, meaning the agent will not audit the critical `nextBdtMidnightUtc()` calculation used for daily driver resets and caps.

## 5. SECURITY / INTEGRITY RISKS

The prompt's PortPos security audit is dangerously incomplete. While it correctly checks for `verifyIPN()`, it entirely omits the `AGENTS.md` requirement to compare the PortPos callback invoice amount against the locally-stored `payment_events.amount_bdt` in integer paisa. Without this explicit check, a malicious actor could theoretically underpay for a subscription. 

## 6. HIDDEN REGRESSION RISKS

If an agent follows the Draft Prompt's instructions for "Phase 2 - Challenge the locked architecture (L1 - Theming)", it will aggressively search for and report NativeWind `dark:` classes as violations. An eager agent might then attempt to "fix" these in a subsequent pass, effectively destroying the repository's established dark mode implementation. Furthermore, the agent will flag tax columns as money format violations.

## 7. MASTER PLAN CONSISTENCY

- **Contradiction:** The Master Plan (L1) states "No NativeWind `dark:` classes in new screens." However, `AGENTS.md` establishes that "Dark mode is handled by NativeWind `dark:` variants." The Draft Prompt blindly enforces the stale Master Plan rule.
- **Omission:** The prompt mentions state machines and testing but ignores the strict 5 dispatch invariants and 3 payment invariants defined in `AGENTS.md`.
- **Omission:** The prompt does not require checking the strict 8 lowercase values for `vehicleTypeEnum` and the absence of legacy uppercase ones.

## 8. DRAFT PROMPT DEFECTS

1. **Theming Contradiction (L1):** Enforces the stale Master Plan "Pattern A" rule and explicitly hunts `dark:` classes, contradicting the `AGENTS.md` NativeWind standard.
2. **Missing MCP Directives:** Fails to instruct the agent to use the required `codebase-memory-mcp` tools (`search_graph`, `trace_path`) for Phase 1 reconnaissance.
3. **PortPos Amount Verification:** Misses the requirement to verify the callback amount against local `payment_events.amount_bdt`.
4. **Bodyless POST False Positives:** Enforces `parseJsonBody` for all POST requests, ignoring the explicit `AGENTS.md` exemption for bodyless endpoints.
5. **Money Rule Exception:** Fails to exclude `rate_percent` (`numeric(5,2)`) from the integer paisa rule, guaranteeing false positives on tax ledgers.
6. **Missing Dispatch Invariants:** Fails to instruct the agent to verify daily caps, batch exclusions, and the `dispatch_offers` vs `call_ledger` unique constraints.
7. **Package Scoping:** Ignores the `vehicle_type_mismatch` logic and `packages.vehicle_type` scoping constraint.
8. **Timezone/Timestamp Logic:** Omits the requirement to audit UTC `timestamptz` and the mandatory `nextBdtMidnightUtc()` helper.
9. **Write Ownership Gaps:** Mentions `call_ledger` deductions but misses `call_ledger` refunds, `dispatch_offers`, and payment status transitions.

## 9. REQUIRED CHANGES

- **Update L1 Theming Audit:** Replace the instruction to hunt `dark:` classes with an instruction to verify that NativeWind `dark:` variants are used correctly as per `AGENTS.md`.
- **Add MCP Tool Requirement:** Prepend Phase 1 with an explicit directive to use `codebase-memory-mcp` (`search_graph`, `trace_path`) for all tracing and architecture discovery.
- **Amend API Boundary Audit:** Add a clause exempting bodyless POSTs from the `parseJsonBody` requirement.
- **Amend Money Audit:** Explicitly exempt `rate_percent` columns from the integer paisa requirement.
- **Update PortPos Audit:** Add a check to verify that the IPN callback compares the invoice amount to `payment_events.amount_bdt` in paisa.
- **Add Dispatch & Package Audits:** Add specific bullets to audit the 5 dispatch invariants, the `platform_config` dynamic loading, the 8 lowercase vehicle enums, and the `vehicle_type` package scoping.
- **Add Timezone Audit:** Add a check for UTC persistence and `nextBdtMidnightUtc()` usage for daily calculations.
- **Update Write Ownership:** Include `call_ledger` refunds, other event types, and `dispatch_offers` in the write-ownership audit.

## 10. FINAL GUIDANCE

Revise the Draft Kilo Prompt to treat `AGENTS.md` as the ultimate source of truth, explicitly overriding the Master Plan where contradictions exist (most notably in theming and API request bodies). Expand the backend, dispatch, and money audit sections to include the strict invariants, exceptions, and security checks defined in the repository rules. Finally, ensure the prompt instructs the executing agent to use the project's native graph tools (`codebase-memory-mcp`) rather than relying purely on manual file tracing.

I have completed the whole-system consistency audit. Let me know if you need any adjustments to the findings or further assistance with applying these changes to your prompt!