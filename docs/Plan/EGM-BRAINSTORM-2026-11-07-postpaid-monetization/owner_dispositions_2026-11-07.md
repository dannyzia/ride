**Purpose:**     Owner rulings resolving all open decisions from the postpaid-monetization brainstorm (D1–D7). Authoritative input for `/egm-draft`; the design document must implement these verbatim.
**Owner:**       Zia (ruling text below is verbatim owner input, 2026-11-07). Rulings beat artifacts on divergence — record divergence in-file, never reconcile silently.
**Status:**      ACTIVE — APPROVED FOR `/egm-draft`
**Source of truth:** This file (verbatim capture of the owner's disposition message).
**Related (concrete paths):**
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/concepts_brief.md` — the dispositions resolve its Blockers/Majors/open decisions (each cites finding IDs)
  - `docs/Plan/EGM-BRAINSTORM-2026-11-07-postpaid-monetization/feature_concept.md` — the concept the rulings amend
**Last verified:** 2026-11-07, by Elephant (capture only; content is owner-authored)
**How to update:** Never edit ruling text. New rulings go in a new dated section or file.

---

# Owner Dispositions (Zia) — Postpaid Monetization (`concepts_brief.md`)
Date: 2026-11-07
Status: APPROVED FOR `/egm-draft`

## 1. Approval of Converged Structural Decisions
All 6 structural decisions, the M-10 schema allow/forbid list, the M-13 single-writer transition map, and the M-14 test surface are **APPROVED**:
1. **Dedicated `driver_bills` table + `driver_unpaid_obligations` DB view (Integer Paisa everywhere)**: Single authoritative source of truth across all 4 consumers (per-driver lib helper, batched `GROUP BY` dispatch query, settle-first purchase gate, dues API/screen, and account-deletion gate). Never overload `payment_events.status` to mean "owed."
2. **Atomic Grant + Bill, Split from Settlement**: `grantSubscriptionOnCredit` (inside `lib/activateSubscription.ts`) writes the subscription grant, `call_ledger` row, and open `driver_bills` row in one `db.transaction` under the per-driver advisory lock. Later payment creates a separate `payment_events` row with `purpose = 'subscription_settlement'` and kind-discriminated settlement records so legacy orphan-sweep/repair and commission math never collide.
3. **Settle-First Serialization**: Acquire the per-driver advisory lock at purchase initiation + enforce a partial unique index allowing at most one open subscription bill per driver (`23505` mapped to typed `409`).
4. **Per-Driver Mode Classification & Snapshots**:
   - Store `product_type` (`'call_package' | 'commission'`) on the package and snapshot the driver's mode at activation and on the ride row at offer/accept time.
   - Classify per driver inside `debitLeadForOffer` (`SELECT ... FOR UPDATE`). Give commission drivers a fixed neutral `balanceScore` in `dispatch.ts` (never use the `-1` call-count sentinel for commission).
   - Tightened pool predicate for subscribers: `status = 'active' AND frozen_at IS NULL AND expires_at > now() AND (calls_remaining > 0 OR calls_remaining = -1)`.
   - Delete the v6 shadow fare engine hard-coded `0` commission (`complete+api.ts:192-194, 261`) so v6 reads the same ride-time mode snapshot and pricing percent as v2 (B6).
5. **Global `revenue_model` Demoted to Kill-Switch**: Keep `platform_config.revenue_model` strictly as a fresh-read launch/rollback kill-switch (`OFF` = legacy behavior).
6. **Staged Rollout**: (1) Schema/migrations -> (2) `utils-server` (empty possession falls back to legacy) -> (3) API/EAS + kill-switch activation.

## 2. Rulings on Open Owner Decisions

### D1 — Ceiling Semantics, Day-Zero Receivable (A5), Dust-Dues & Headroom (B1, M-7)
- **Preserve A5 Unified Total Exposure (`unpaid_subscription_paisa + net_commission_paisa`) with a Ceiling Floor Invariant**:
  - Because Subscribers accrue `0` commission (Mutual Zeroing) and cannot buy another package while a bill is open (Settle-First), a subscriber's obligation remains constant at the package price until paid.
  - To prevent day-zero lockout on package purchase while keeping one unified exposure number, enforce a seed/migration and admin-config validation invariant:
    `max_commission_debt_bdt (50,000 paisa / ৳500) >= max(active call_package price_paisa) + 1,000 paisa (dust buffer)`.
    *(With max package price ≤ ৳400 / 40,000 paisa and ceiling at ৳500 / 50,000 paisa, a freshly granted package is a 40,000-paisa receivable on day zero and leaves 10,000 paisa of headroom—never locking out the buyer.)*
  - **Safety backstop**: Even if an admin later lowers the ceiling below an already-granted active subscription bill, an un-expired, un-exhausted subscription bill cannot lock out the very subscription it granted until that subscription lapses or exhausts.
- **Dust-Dues Rule (`< 1,000 paisa` / `< ৳10`)**:
  - Because PortPos settlement enforces a `1,000` paisa (৳10) minimum (`app/api/driver/dues/pay+api.ts`), any positive unpaid total strictly below `1,000` paisa (`0 < total_unpaid_paisa < 1000`) is **non-blocking dust**: Settle-First allows purchasing/switching, and the dust balance stays in `driver_unpaid_obligations` to roll into the next payable settlement `>= 1,000` paisa.
- **Credit Headroom & Warning Threshold (M-7)**:
  - Display credit headroom (`ceiling_paisa - total_unpaid_paisa`) on the Package Purchase sheet and Dues screen.
  - Surface a non-blocking home-screen warning banner at **80% of ceiling (`40,000` paisa / ৳400)** for commission drivers, or **`calls_remaining <= 2`** for subscribers.

### D2 — A2′ Frozen Calls on Product Switch (M-4)
- **Ruling: Preserve A2′ using an additive `frozen_at timestamptz NULL` column on `subscriptions` + separate commission enrollment representation.**
  - Because Settle-First requires clearing any unpaid bill before switching to the Commission package, any subscriber who switches mid-pack (including existing prepaid drivers under `A1′`) holds **paid-up calls**.
  - When a paid-up subscriber enrolls in the Commission package:
    1. Set `subscriptions.frozen_at = now()` on their active call subscription (do **not** expire it via the supersede sequence, and do **not** widen `subscriptionStatusEnum`).
    2. `expires_at` continues ticking naturally (no refund, no expiry extension).
    3. Both `dispatch.ts` and `leadBilling.ts` treat `frozen_at IS NOT NULL` as inactive for call-package possession/debiting, while the active commission enrollment governs their mode.
    4. If the driver switches back to Call Package mode while `expires_at > now() AND calls_remaining > 0` (and has settled any commission dues >= 1,000 paisa), clear `frozen_at = NULL` and deactivate the commission enrollment—no new bill generated. If `expires_at <= now()`, the frozen subscription lapses normally via the scheduler.

### D3 — Commission Package Duration & Fraud Gate (M-12)
- **Ruling: Non-expiring enrollment (`expires_at = NULL`, `duration_days = NULL`).**
  - Commission enrollment remains active until the driver switches to a Call Package or hits the `50,000` paisa (`৳500`) dispatch lockout ceiling.
  - Extend `checkPackagePurchaseGate` (`purchase+api.ts:52-91`) to commission enrollment and dues-payment retries, and document expected maximum fraud exposure per account as `min(max_package_price_paisa, ceiling_paisa)` (`40,000` paisa / ৳400) in the design doc.

### D4 — Onboarding Choice vs. Launch-Free Trial (M-5)
- **Ruling: Mandatory onboarding choice; existing drivers untouched (`A1′`); 1-time ৳0 trial attached to the Call Package option.**
  - Existing drivers with active subscriptions continue seamlessly as subscribers (`A1′`, zero backfill).
  - New drivers must explicitly choose at onboarding (no silent auto-enrollment):
    1. **Call Package (Starts with 1-Time Free Trial)**: Grants the `price_bdt = 0` launch-free call package via the existing `subs_one_trial_per_driver` guard. Because the price is `0` paisa, **no open bill row is written** (does not consume the open-bill slot). Once trial calls exhaust or expire, hard lockout applies (`LAPSED` / `balance_exhausted`) until they buy a postpaid Call Package or enroll in Commission.
    2. **Commission Package (`৳0` enrollment, pay per completed trip)**: Enrolls directly in the `product_type = 'commission'` package (`price_bdt = 0`, no bill at enrollment).
  - Track `registered_drivers_no_product` for drivers who exit onboarding before choosing, and show a 1-tap choice card on their home screen.

### D5 — Grandfather Policy for Pre-Cutover Commission Rows (M-9)
- **Ruling: Zero-and-forgive any pre-cutover commission accrual.**
  - Commission accrual in `driver_unpaid_obligations` must only count rides where the ride-time snapshot is `monetization_mode_snapshot = 'commission'` (or zero out any pre-cutover `platform_commission_bdt > 0` rows created while the global model was `subscription_only`). No driver may be blocked by pre-launch/pre-switch commission artifacts.

### D6 — Bill Due-Date & Dunning Semantics (M-7)
- **Ruling: Event-driven enforcement at launch (no background dunning cron in v1).**
  - **Subscription bills**: `due_at = subscription.expires_at` (or immediate upon exhaustion/next purchase via Settle-First). Payable anytime on the Dues screen.
  - **Commission dues**: Accrued per completed trip on post-minimum-floor fare (rendered as a line item on the driver's trip-complete receipt); payable anytime once total dues `>= 1,000` paisa (`৳10`); enforced at the `50,000` paisa (`৳500`) ceiling or upon product switch.

### D7 — Courier COD Prior Art & Governance (M-1, B8, B9, M-11, Nits)
- **Courier COD Prior Art (M-1)**: Cite `lib/deliverySettlement.ts` in the design doc. Keep storage separate (COD cash remittance != platform fee receivables), but reuse the two-point guard pattern (pool filter + debit/accept check) and structured hold logging.
- **Zero Escrow Amendment (Dated 2026-11-07)**: Amend the ruling text to state: *"Zero Escrow means the platform never holds rider trip money or operates driver payout rails (riders pay drivers directly). Extending first-party platform credit to drivers for call packages and per-trip commission receivables settled via PortPos is platform billing, not escrow."*
- **Observability, UX & Bilingual Vocabulary (B8, B9, M-11)**: In launch scope—ship the 6-state driver home banner (`ACTIVE`, `OWING`, `CEILING_LOCKED`, `LAPSED`, `PURCHASE_BLOCKED`, `PRODUCT_FROZEN`), post-purchase credit confirmation (*"N calls added · Bill ৳X — Pay Now or Pay Later"*; never use the word "free" for credit packs), deep-linked Settle-First recovery (`<= 2 taps` to PortPos), sanitized BN/EN error messages for all new error codes, info-level lockout/accrual logs, and a minimal admin locked-drivers list.
