Hard second pass done. I re-read both documents line-by-line against the file tree. Pass 1 found schema/logic bugs; this pass finds **race conditions, launch-blockers, privacy over-shares, and places where the spec violates its own stated invariants** (write-ownership, state machines, module isolation). All findings below are **new** — not repeats of Pass 1 — and I flag where one escalates a Pass 1 item.

---

# 🔴 Launch-blockers

**P2-1 · The bidding gate can 403 *every* fleet at launch.**
`requireFleetMarketplaceAccess()` (§E.1) hard-requires `fleet_subscriptions.marketplace_enabled = true` + `status='active'` + unexpired. But §C.8 explicitly **skips** building any way to set that flag ("skip the subscription endpoint unless Zia rules it in… the existing fleet_subscriptions admin endpoints (**if any**) are the write paths"). That "if any" is doing a lot of work. If no existing admin path sets `marketplace_enabled`, **no fleet can ever bid** and the entire rental marketplace is dead on arrival. `list.txt` shows `fleet/subscription+api.ts` and `admin/fleet-billing/fleet-plans`, but nothing confirms a `marketplace_enabled` write path. This must be verified *before* Phase 2, not marked UNVERIFIED.

**P2-2 · The driver-identity model inside fleets is undefined — it breaks authorization.**
- §A.2.3 requires the assigned driver to satisfy `EXISTS (… fleet_members WHERE user_id=$driver AND fleet_id=$fleet AND status='active')`.
- But `fleet_members.role` vocabulary (per `lib/auth.ts`) is `OWNER/MANAGER/DISPATCHER/ACCOUNTANT/VIEWER` — **there is no `driver` role**.
- So what `fleet_members.role` does a driver hold? Unspecified. If drivers aren't `fleet_members`, the driver-pick validation is wrong. If they are, under which of the five roles?
- Worse: `POST /api/rental/bids/[id]/complete` uses `requireFleetMember(fleet_id, ['OWNER','MANAGER','DISPATCHER','driver'])` — but `'driver'` is a **`users.role`, not a `fleet_members.role`**, so that allow-list is malformed and the assigned driver may not authorize at all.

This is a foundational gap the plan's §0.2 ("fleet dependency now satisfied") papers over. Resolve the driver↔fleet-membership model before writing any driver-pick or complete code.

---

# 🟠 Critical — the spec contradicts itself

**P2-3 · The clock-freeze "both implementations are correct" claim is FALSE.** *(the crown-jewel bug)*
§B.1 offers two implementations and says "both are correct." They are not:
- **Stored-column** (update `confirmation_deadline_at = assigned_at + 60min` on assign): correct — while unassigned the column is NULL, so the sweep skips it. Clock truly frozen.
- **Lazy formula** `GREATEST(awarded_at + 60min, COALESCE(assigned_at, awarded_at) + 60min)`: when the fleet **never** assigns, `COALESCE(NULL, awarded_at) = awarded_at`, so the deadline collapses to `awarded_at + 60min`. At T+60 the sweep fires and cancels with `cancel_reason='customer_overslept'` and **increments `reoffer_count` as a customer fault** — even though the customer *couldn't* confirm (no driver assigned) and the failure is actually the fleet's. This directly defeats the asset-hostage protection that the whole fork was built for.

Pick the stored-column implementation and **delete the lazy formula**. An implementer who picks the "simpler" one ships a bug that punishes customers for fleet failures.

**P2-4 · The spec violates its own Write-Ownership matrix (§A.6).**
- `delivery_requests` sole writers are declared as `app/api/delivery/requests+api.ts` + `utils-server/deliveryChain.ts`. But the food bridge `lib/shopDeliveryBridge.ts` (§C.4 / Phase 4) **creates** `delivery_requests` rows — a third, undeclared writer.
- `shop_orders` sole writers are declared as the shop endpoints + "delivery completion handler." But Phase 4 modifies `app/api/delivery/requests/[id]/accept-bid+api.ts` to write `shop_orders.delivery_fee_bdt` — that's an *accept* path, not the listed completion handler.

Either add these writers to §A.6 or route the writes through the declared owners. As written, the spec's flagship invariant is broken by its own composition layer, and the §H.8 isolation grep won't catch it.

**P2-5 · Runner-up promotion never updates `rental_requests.awarded_bid_id`.**
§B.1's `awarded → broadcasting` (SLA timeout) side effects release the stale assignment and insert a new `awarded_bid_assignments` row, but **never reassign `awarded_bid_id`** to the promoted bid. Yet §D.1.8 `rental:status` carries `awarded_bid_id`, and confirm/accept logic reads it. After a promotion it still points at the now-`lost` bid. Add "set `awarded_bid_id` = promoted bid" to the side effects.

---

# 🟠 Critical — race conditions (none are guarded)

Pass 1 caught the emergency accept race. The second pass finds the same class everywhere, with **no atomic-transition primitive specified** for any of them:

- **P2-6 · Double-accept.** Customer double-taps, or two sessions accept two different bids simultaneously. `rental:accept_bid` (§D.1.4) has no `UPDATE … WHERE status='collecting'` guard → two `won` bids, two assignments. Fix: conditional UPDATE on request status, check rowCount.
- **P2-7 · Accept-vs-withdraw.** Fleet withdraws the exact instant the customer accepts. No ordering rule defined.
- **P2-8 · Bid after soft deadline.** `onSubmitBid` (§D.1.2) never validates the request is still `broadcasting/collecting`. A bid landing as the sweep runs can attach to a `no_bidders`/`awarded` request.
- **P2-9 · Delivery double-accept.** Two `delivery:accept_bid` race → **two `delivery_legs`** rows (§C.3 has no guard).
- **P2-10 · Emergency has a failure timeout with no clock.** §B.5 `broadcasting → failed` fires when "window passes," but `emergency_requests` (§A.5.2) has **no deadline/expires column**, so "window passes" is uncomputable. Add `expires_at`.

---

# 🟡 High — missing machinery the state machines assume

- **P2-11 · Last-bid withdrawal strands the request in `collecting`.** If the only bid is withdrawn, there's **no `collecting → broadcasting` transition** (§B.1/§B.2). At deadline, "collecting → awarded: at least one bid exists" vs "collecting → no_bidders: zero bids" — ambiguous whether a *withdrawn* row counts. Define the behavior (revert to broadcasting, and count only `active` bids).
- **P2-12 · `no_bidders → broadcasting` is a phantom transition.** §B.1 defines it ("Customer retries"), but §C.2 has **no retry endpoint**. Worse, the row's own note says "New request row created" — which means the *old* row never transitions. The table row contradicts its own note. Either build a retry endpoint or delete the transition.
- **P2-13 · The 15-min assignment sweep is missing from the deliverables.** Escalates Pass 1 B12: the final "Summary of modified existing files" says scheduler.ts gets "two new jobs (soft-deadline, confirmation-deadline)" and **omits the assignment-deadline sweep entirely** — the most important new job. It's listed in Phase 2's checklist but not in the final file list. An implementer following the summary ships without the SLA engine.
- **P2-14 · Shop order 10-min auto-cancel has no scheduler.** §B.3 `pending → (auto) cancelled` needs a sweep, but Phase 1 ships **no** scheduler job. Dead transition.
- **P2-15 · `shop_rfqs` has no state machine and no expiry path.** §A.0.8 defines 6 states, but there is **no §B.x table for shop_rfqs**, no decline endpoint, no expiry sweep. `declined/expired/cancelled` are unreachable.
- **P2-16 · `fleet_service_zones` has no write path.** §A.2.4's geo-filter depends on a table with **zero management endpoints** (not in §C.7 admin either). It ships empty and permanently inert → every fleet is "global" forever.
- **P2-17 · Ambulance cert renewal is impossible.** `UNIQUE (user_id, vehicle_id)` (§A.5.1) blocks a driver from re-certifying an expired cert for the same vehicle; there's no renew/update endpoint. Make it a partial unique on active, or add renew.
- **P2-18 · Delivery bid withdrawal: status exists, endpoint doesn't.** `delivery_bids.status` includes `withdrawn` (§A.3.2) but §C.3 has no withdraw route (rental has one). Couriers can't withdraw.
- **P2-19 · Losing fleets are never told they lost.** On accept, §D.1.5 `rental:bid_won` goes to the winner only; §D.1.8 `rental:status` recipients are "request owner + winning driver." Losing fleets' bids flip to `lost` with **no event**, so their UI shows the bid as `active` until manual refresh. Add a `rental:bid_settled` to all bidders on the request.
- **P2-20 · Fleet dispatchers lose visibility after winning.** §D.1.5 broadcasts `bid_won` to all fleet members, but subsequent `rental:status` (§D.1.8) excludes them (only "winning driver," who isn't chosen yet). Dispatchers go blind during the 15-min pick window — exactly when they need it.
- **P2-21 · Delivery broadcasts have no eligibility/geo filter.** Rental got `fleet_service_zones`; delivery (§C.3/§D.3.1) just says "broadcast to eligible couriers" with **no definition of eligible**. Every courier gets every request → spam. Define online + vehicle-type + geo filtering.

---

# 🟡 Security & privacy

- **P2-22 · Suspension is unenforced.** `requireShopMember` (§E.2) and `requireFleetMarketplaceAccess` (§E.1) check membership/subscription but **not `shops.status` / fleet status**. A suspended shop's staff can keep operating. Add a status check to both guards. *(Extends Pass 1 B11.)*
- **P2-23 · Customer phone leaked to the whole fleet pre-assignment.** §D.1.5 `rental:bid_won` sends `rider.phone` to **every connected member** of the winning fleet, before any driver is chosen. Reveal the phone only to the assigned driver (§D.1.5b already does this correctly on the other side).
- **P2-24 · Health data broadcast to all bidders.** §D.1.1 sends `patient_condition` to **every eligible fleet**, including losing ones. Minimize to what bidders need; don't leak medical detail to fleets that never win.
- **P2-25 · Bid sealing rests on an unstated assumption.** §C.2 `/api/rental/bids/active|history` must be strictly scoped to the caller's fleet, but the contract doesn't say so — and with multi-fleet users (Pass 1 B2) "the caller's fleet" is ambiguous. If mis-scoped, it violates the sealed-bid guarantee (§1).

---

# ⚪ Medium / contradictions (compact)

| # | Finding | Where |
|---|---|---|
| P2-26 | Withdraw auth says "bid owner (driver)" but §B.2 allows any OWNER/MANAGER/DISPATCHER — contradiction | §C.2 vs §B.2 |
| P2-27 | Confirm endpoint omits the `assigned_driver_user_id IS NOT NULL` guard and NULL-deadline handling | §C.2 vs §A.0.3 |
| P2-28 | Shop orders + RFQs locked to `requireRole('rider')` exclude `driver`-role users from being customers (shop *create* allows both) | §C.1 |
| P2-29 | `draft` and `expired` states are dead — requests go straight to `broadcasting`; nothing enters `expired` | §A.0.3/§B.1 |
| P2-30 | §A.1.4 shows `delivery_fee_bdt` nullable, but M-005 claims M-002 made it NOT NULL — contradiction | §A.1.4 vs M-005 |
| P2-31 | M-003 "ALTERs" `rental_requests` in the same migration that CREATEs it | §G.0 |
| P2-32 | Scheduler single-instance / leader-election unaddressed — concurrent sweeps can double-promote | §B.2 |
| P2-33 | Rental sweeps live in shared `scheduler.ts`; a throwing rental job can kill ride-hailing jobs (isolation risk) unless per-job try/catch | scheduler.ts |
| P2-34 | No WS reconnection/catch-up story — a dropped socket misses `new_bid` events with no sync message | §D |
| P2-35 | Food bridge creates a delivery_request but no event tells the customer the new delivery id | §C.4 |

---

# Auction-design risk (product)

**P2-36 · "Accept the first bid immediately" can kill the auction.** §1/§B.1 let the customer accept bid #1 with no forced wait. Rational customers do exactly that, later (cheaper) bids never get seen, fleets learn the deadline is meaningless, and bid quality degrades. Consider a short minimum collection window, or a prominent "more bids usually arrive" nudge. Not a bug — a mechanism-design risk worth a ruling.

---

# What I'd fix first (ordered)

1. **P2-3** — delete the lazy clock formula; it defeats the core protection.
2. **P2-1 / P2-2** — verify the subscription write path and resolve the driver↔fleet-membership model. Both block Phase 2.
3. **P2-4** — reconcile the write-ownership matrix with the food bridge before coding it.
4. **P2-6…P2-10** — specify one atomic-transition primitive (conditional UPDATE + rowCount) and apply it to accept/withdraw/submit/emergency.
5. **P2-5, P2-13, P2-19, P2-20** — the award/promotion/notification loop is currently lossy; close it.
6. Sweep the dead states and phantom transitions (P2-12, P2-14, P2-15, P2-29).

Want me to turn the top cluster (P2-1 → P2-5) into a concrete spec patch — corrected §B.1 wording, the atomic-accept SQL, and the reconciled §A.6 write-ownership matrix?