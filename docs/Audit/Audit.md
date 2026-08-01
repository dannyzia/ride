Audit 1 — Payment & Money Flows (highest risk)

Audit the payment and money flows in this ride-hailing app. Focus on money
correctness, exploit prevention, and accounting accuracy.

READ THESE FILES:
- app/api/ride/[id]/complete+api.ts (fare finalization, tip, wait fee, tolls, accounting)
- app/api/payment/portpos/callback+api.ts (payment callback — pass/wallet/package routing)
- app/api/driver/instant-pay+api.ts (driver withdrawal)
- app/api/driver/wallet/topup+api.ts (driver wallet top-up)
- app/api/rider/wallet/topup+api.ts (rider wallet top-up)
- lib/accounting.ts (double-entry journal — all 8 recording functions)
- lib/tax.ts (VAT + source tax calculation)
- lib/fareCalc.ts (fare calculation with surge, intercity, pass discount)

CHECK FOR:
1. Can any user create money out of nothing? (unfunded credits, missing debits)
2. Are all wallet updates in transactions?
3. Does the accounting Dr=Cr invariant hold for every recording function?
4. Are tips, tolls, wait fees, and surge all handled correctly in the final fare?
5. Can the PortPos callback be replayed? (same payment event processed twice)
6. Is commission calculated correctly? (post-floor, not on raw total; NOT on tips)
7. Can instant-pay withdraw more than the wallet balance? (negative balance check)

KNOWN ISSUES (already found — don't re-report):
- Upfront tip had no cap + no funding check (being fixed)
- Commission was charged on tip (being fixed)

Output: severity-ranked findings (P0=exploit, P1=money bug, P2=logic, P3=cosmetic)


Audit 2 — Dispatch Engine (core loop safety)

Audit the WebSocket dispatch engine. Focus on ride matching correctness,
call deduction integrity, and filter safety.

READ THESE FILES:
- utils-server/dispatch.ts (candidate scoring, filters, batch offers)
- utils-server/index.ts (WS connection handler, ride:offer broadcast, location update)
- utils-server/heartbeat.ts (call deduction — the ONLY file that should write call_ledger)
- utils-server/scheduler.ts (scheduled jobs — surge, expiry, cleanup, gamification, safety)

CHECK FOR:
1. Can a driver receive the same ride offer twice? (batch exclusion)
2. Can calls_remaining go negative? (balance check timing vs deduction)
3. Does auto-accept respect call_ledger write-ownership? (should route through heartbeat)
4. Are all filters (commute, blocklist, female pref, auto-accept) fail-open on error?
5. Can a driver accept a ride they're blocked from? (race condition between filter + accept)
6. Is the H3 index query correct? (drivers in zone but outside H3 cell missed?)
7. Does the scheduler have job isolation? (one failing job doesn't block others)
8. Is INSTANCE_COUNT=1 enforced? (split-brain prevention)

Output: severity-ranked findings


Audit 3 — API Authorization & Input Validation

Audit ALL API routes for authorization and input validation.

CHECK EACH ROUTE IN app/api/ FOR:
1. Auth: Does every non-public route call verifySupabaseToken(request)?
   Does every admin route use requireRole('admin')(request) — curried?
2. Ownership: Can user A read/modify user B's ride, wallet, documents?
   (check: does the query filter by the authenticated user's ID?)
3. UUID validation: Are all dynamic [id] params validated with z.string().uuid()?
4. Input validation: Do all POST/PATCH use parseJsonBody + Zod (not raw request.json())?
5. Expo params: Do dynamic routes use { id }: { id: string } (flat, NOT { params })?

SAMPLE 10 routes across these areas:
- app/api/ride/[id]/complete+api.ts
- app/api/ride/[id]/stops+api.ts
- app/api/ride/[id]/extra-charge+api.ts
- app/api/rider/lost-items+api.ts
- app/api/driver/lost-items+api.ts
- app/api/admin/fare-disputes+api.ts
- app/api/admin/rider-passes+api.ts
- app/api/rider/block+api.ts
- app/api/accounting/entries+api.ts
- app/api/ride/schedule+api.ts

Output: list of routes with auth/validation gaps, severity-ranked


Audit 4 — Trust & Quality System

Audit the Trust & Quality System (lost items, fare disputes, blocklist).

READ THESE FILES:
- app/api/rider/lost-items+api.ts (report + list, 24h window)
- app/api/driver/lost-items+api.ts (list + respond: confirm/photo/return/not_found)
- app/api/admin/lost-items+api.ts (list all + mediate)
- app/api/rider/fare-disputes+api.ts (file dispute + auto/manual review)
- app/api/admin/fare-disputes+api.ts (list + resolve with wallet credit)
- app/api/rider/block+api.ts (block/unblock/list)
- lib/fareArbitration.ts (auto-arbitration logic)
- utils-server/dispatch.ts (blocklist filter in scoring loop)

CHECK FOR:
1. Can a rider file a dispute for a ride they didn't take? (ownership)
2. Can a driver respond to a lost item they don't own? (ownership)
3. Is the 24h/48h window enforced server-side? (not just client)
4. Can admin resolve a dispute twice? (double refund)
5. Is the wallet credit in fare-disputes resolution transactional?
6. Does the blocklist filter actually prevent matching? (check dispatch loop)
7. Can a rider block ALL drivers? (no rate limit → DoS)

Output: severity-ranked findings


Audit 5 — Tax & Accounting Engine

Audit the Tax & Accounting Engine for mathematical correctness.

READ THESE FILES:
- lib/tax.ts (calculateTax, recordTaxLedger, getDailyTaxReport)
- lib/accounting.ts (createJournalEntry + 8 recording functions)
- app/api/admin/tax/config+api.ts (rate CRUD)
- app/api/admin/tax/report+api.ts (CSV export — taka conversion)
- app/api/accounting/trial-balance+api.ts (Dr=Cr verification)
- app/api/accounting/export+api.ts (external CSV)

CHECK FOR:
1. Does recordRideCompletion produce a balanced journal? (Dr total = Cr total)
   Verify algebraically: Dr Cash = fare. Cr = commission_net + VAT + driver_share_net + source_tax.
   Sum of Cr must equal fare.
2. Does recordDriverPayout balance? (was previously broken — fixed?)
3. Does recordSubscriptionSale balance?
4. Is the CSV export correct? (paisa → taka ÷100, 2 decimals)
5. Is the trial balance actually balanced? (SQL query correct?)
6. Can tax rates be set to negative? (should be 0-100)
7. Are tax ledger inserts protected by the missing-rate null guard?

Output: severity-ranked findings + algebraic verification of each journal entry


