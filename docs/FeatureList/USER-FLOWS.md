# Ride — User Flows & Workflows (Mermaid) — FULL LIBRARY v2

**Purpose:**     Visual source of truth for EVERY user flow and workflow across all personas (Customer, Driver, Shop Owner + staff, Fleet Owner + dispatcher, Delivery Man, Admin web panel) — implements `docs/Plan/27-SHOP-FLEET-STAFF-DELIVERY-SURFACES-PLAN.md` (§0 rulings, §11 corrections, §12 settlement, §14 subscriptions) **plus §15.1 (Kimi UX audit — accepted in full, waves W1–W3)**. Rendered copy: `USER-FLOWS.html` (regenerate: `node docs/FeatureList/build-user-flows-html.cjs`).
**Owner:**       Orchestrator (the plan is the contract) — Coding model keeps diagrams in sync with shipped screens.
**Status:**      ACTIVE v2 (2026-10-12 — all six reviews consolidated; §15 C rejections and D deferrals apply here too)
**Source of truth:** `docs/Plan/27-SHOP-FLEET-STAFF-DELIVERY-SURFACES-PLAN.md` — discrepancies = plan wins, fix the diagram.
**Related (concrete paths):** `maestro/COVERAGE-MANIFEST.md`, `docs/FeatureList/FEATURES.md`, `docs/FeatureList/USER-FLOWS-AUDIT-2026-10-12.md` (Kimi audit, accepted in full), `AGENTS.md` § Orchestrator Protocol.
**Last verified:** 2026-10-12, by Orchestrator.
**How to update:** a flow change ships with its diagram change in the same commit; regenerate the HTML with the build script; keep the status badges truthful.

## LEGEND & CONVENTIONS (binding for every diagram)

- **Launch state badges** in every title: ✅ live · 🔨 in development (Plan 27) · 💤 descoped (owner ruling).
- **Roles taxonomy:** 5 registrable roles (Customer, Driver, Shop Owner, Fleet Owner, Delivery Man) · 2 invited sub-roles (Shop Staff — orders-only; Fleet Dispatcher — no payouts) · internal Admin (web only). Sub-roles never appear as signup buttons; they arrive via invite (F-34).
- **Courier** = a Delivery Man, or a Driver with the Deliveries toggle ON.
- **Identity:** phone = login identity · internal User ID = system key for everything else.
- **State vocabulary (shared):** pending / active / in-progress / completed / cancelled / disputed / refunded / archived.
- **`[notify]` convention:** every "notify" edge means the F-29 notification spec applies (channel, batching class, locale).
- **Grammar rule:** sequenceDiagram for money-handshake sequences (F-05, F-11, F-18, F-33); flowchart for state/branching (F-04 dispatch branching stays a flowchart).
- **Offline convention:** any screen that creates state shows a queued indicator ("will send when online") — chat, orders, ratings, SOS, extra-charge approvals.
- **Money:** integer paisa; COD at launch (payments 💤); every rate is a platform_config LAUNCH DEFAULT — fresh-read at request time, admin-editable, never hardcoded.
- **Launch wallet = platform CREDIT only** (refunds / referral / promos) — non-withdrawable; cash moves hand-to-hand at launch. Refunds at launch = credit or ledger reversal, never a gateway refund.
- **Flow ↔ code mapping:** screens annotate their route files where known (e.g., `app/(main)/(customer)/ride-tracking/...`).
- **Empty states are designed** (no shops open, no offers today, no settlements this week) — never blank lists. Degraded dispatch: requests queue as "searching (slow network)" with a cancel path.
- **Language:** every screen renders Bangla/English from the shared copy table — flows never branch on language.
- **Flow ↔ code mapping:** screens annotate their route files where known.

---

## A. AUTH, ROLES & ONBOARDING

### F-01 · 🔨 Registration & role onboarding (5 roles) — progressive disclosure

```mermaid
flowchart TD
  A["Welcome"] --> B["Customer — big button"]
  A --> C["Earn with us — expander"]
  C --> D["Driver"]
  C --> E["Shop Owner"]
  C --> F["Fleet Owner"]
  C --> G["Delivery Man"]
  B & D & E & F & G --> REG["T&C + Privacy acceptance gate"]
  REG --> OTP["Phone + OTP — resend 30s cooldown, voice fallback, change-number escape"]
  OTP --> REGX{"Phone already registered?"}
  REGX -->|"Yes"| LOGIN["→ Login (F-02) — no duplicate account"]
  REGX -->|"No"| WIZ["Role wizard — per chosen role"]
  D & E & F & G --> PEND["Pending — see verification status (F-03)"]
  PEND --> DEC{"Admin decision — within 24h target, 30-day auto-decision"}
  DEC -->|"Approve"| ACT["Active — role unlocked, notified"]
  DEC -->|"Reject — structured: failed field + example + one-tap prefilled resubmit (max 3, then admin unblock)"| PEND
  DEC -->|"Suspend / block"| LOCK["Locked screen — reason + support contact"]
  PEND -->|"Withdraw"| WD["Application withdrawn — data purged per policy"]
```

### F-02 · 🔨 Login & multi-role "Login as" chooser

```mermaid
flowchart TD
  A["Phone + OTP — session re-auth every N hours"] --> B{"Roles held (ACTIVE only — pending roles are NOT listed)"}
  B -->|"one active role"| C["Land directly — last-used role preselected next time"]
  B -->|"multiple"| D["Login as buttons — only active held roles"]
  D --> E["Customer home — shops + ride"]
  D --> F["Driver home"]
  D --> G["Shop dashboard — banner: Acting as staff · Shop name (staff = orders-only)"]
  D --> H["Fleet dashboard"]
  D --> I["Delivery offers inbox"]
  E & F & G & H & I --> S["Settings — Add a role"] --> T{"Gate?"}
  T -->|"Customer"| U["Instant"]
  T -->|"Others"| V["Pending — see F-03 status; NOT selectable in chooser"]
  E & F & G & H & I --> W["Logout / Switch role (returns to chooser, no new OTP)"]
  X["Locked/suspended account"] --> Y["Locked screen — reason + support contact"]
```

### F-03 · 🔨 My verification status (applicant side — canonical; admin side = F-30)

```mermaid
flowchart TD
  A["Verification status screen — per pending role"] --> B["Submitted (timestamp)"] --> C["Docs received"] --> D["Under review — expected within 24h (30-day auto-decision)"]
  D --> E{"Decision"}
  E -->|"Approve"| F["Active — notified — role appears in Login-as"]
  E -->|"Reject — STRUCTURED: failed field highlighted + example of acceptable document"| G["One-tap Fix & resubmit — prefilled with prior answers (max 3, then admin unblock)"]
  G --> D
  E -->|"Suspend / revoke"| H["Suspended — reason + support contact — re-submit path"]
  D -->|"Withdraw"| I["Withdrawn — data purged per policy"]
```

## B. RIDE-HAILING (V1)

### F-04 · 🔨 Customer ride booking → dispatch → match (sequence)

```mermaid
sequenceDiagram
  participant U as Rider
  participant APP as App
  participant GEO as Barikoi
  participant SYS as Dispatch
  participant D as Driver
  U->>APP: Pickup (GPS — fail → pick on map) + destination
  APP->>GEO: Geocode
  GEO-->>APP: fail → rider picks manually on map
  U->>APP: Select vehicle type + Apply promo (F-27)
  APP->>U: Stage-aware fare estimate (config snapshot — R-A9)
  U->>APP: Confirm — cancel-window chip visible with exact fee
  APP->>SYS: Ride requested — rider may cancel (fee per window; cancel edge from here)
  SYS->>SYS: matching_but_filtered reported separately (product telemetry)
  Note over U,D: Matched → driver en route (arriving state, ETA live) → continue at F-05
  alt drivers online
    loop sequential offers — 45s window, max suggestions (config)
      SYS->>D: Offer (min-rate filter respected; filtered counts reported, never shown as "no drivers")
      D->>SYS: Accept → debit-on-offer (PROVISIONAL — reversal rules F-06) → matched
      SYS->>U: Matched — active-ride card: driver photo/name/plate, ETA, masked call, chat, share-trip, PIN
    end
  else no drivers
    SYS->>APP: No-drivers — auto-retry with backoff (3) + "notify me" + one-tap re-book
  end
  SYS-->>SYS: offer budget exhausted → rider informed: keep waiting (radius expands) or free-cancel
```

### F-05 · 🔨 Ride lifecycle — start → finish → cash (sequence)

```mermaid
sequenceDiagram
  participant R as Rider
  participant D as Driver
  participant SYS as System
  R->>D: App shows PIN to driver (one view)
  D->>SYS: Enter PIN — mismatch ×3 → ride locked + admin notified
  SYS-->>D: START (ride ledger opens)
  D->>R: Arrive at stop(s) — multi-stop
  opt Mid-ride changes (owner-confirmed)
    R->>SYS: Change destination / add stop — re-estimate shown
  end
  opt Tolls / waiting (G2 — in-ride approval)
    D->>SYS: Extra charge — toll/parking/waiting + reason
    SYS->>R: Approve / Decline (in-ride card)
    SYS-->>SYS: Approved → ledger entry · Declined → driver may record, flagged for admin review
  end
  D->>D: Finish guard (accidental-press confirm)
  SYS->>R: Breakdown — every deviation explained: +৳40 toll (approved in-ride) · +৳25 detour +3 km
  R->>D: Cash + change-making noted
  D->>SYS: Cash-received confirmation (amount)
  SYS->>R: Receipt issued
  D-->SYS: Off-route / early-finish anomaly → flagged → trip-issue queue (F-25/F-10)
  opt Post-ride privacy
    R->>SYS: Masked call / chat — expires 24h
  end
  R->>R: Rate driver (+ tip)
  D->>D: Rate rider
```

### F-06 · 🔨 Cancellation, no-show & driver-no-show (CANONICAL — both sides; F-25 merged here)

```mermaid
flowchart TD
  A["Ride matched"] --> B{"Rider cancels"}
  B -->|"Inside window — countdown chip visible, exact fee in dialog"| C["Free / paid cancel per stage — driver notified"]
  B -->|"After window"| D["Cancel fee — owed via ledger (F-33 dues)"]
  A --> E{"Driver cancels"}
  E --> F["Rider NOTIFIED + choice: free-cancel OR auto-accept next match (toggle)"] --> G["Re-dispatch — capped attempts → auto-cancel + both notified"]
  E --> H["Driver penalties — debit-on-offer REVERSED"]
  F --> I["Micro-survey: why cancelled — feeds driver ranking"]
  A --> J["Driver matched but NOT ARRIVING (G1)"] --> K["Rider waiting timer — visible countdown — 'Driver not here' button"]
  A --> ST["Driver STALE mid-pickup (no movement / heartbeat >120s)"] --> ST1["Auto re-dispatch — driver excluded this ride"]
  K --> L{"Driver responds to status check?"}
  L -->|"Yes — genuine delay"| M["Ride continues"]
  L -->|"No — timeout"| N["Auto-cancel — FREE for rider — re-dispatch offered — driver record flagged (evidence: geofence + call attempt + minimum wait)"]
  N --> O["Rider dispute → F-10"]
```

### F-07 · 🔨 Scheduled ride & book-for-other

```mermaid
flowchart TD
  A["Schedule ride — date/time window"] --> B["Overlap check"] --> C["Scheduled — quote shown"] --> D["Reminders T-30min + T-5min"]
  D --> E["At window — AUTO-ENTERS dispatch (F-04), no rider re-confirm"]
  E -->|"No driver at window"| F["Fallback — expand radius / notify / free-cancel"]
  C -->|"Cancel scheduled"| G["Cancel — fee rules by time-to-window"]
  C -->|"Edit"| H["Re-validate overlap"]
  I["Book-for-other"] --> J["Rider consent + freshness check"] --> K["Other's phone + name"] --> L["Ride booked on their behalf"]
  L --> M["PIN delivered to PASSENGER via SMS"] --> N["Passenger SOS parity"]
  K -->|"Passenger not on app"| O["SMS + call fallback — consent recorded"]
```

### F-08 · 🔨 In-ride chat (rider ↔ driver)

```mermaid
flowchart LR
  A["Ride active"] --> B["Chat thread — offline indicator; queued messages show sent-when-online"]
  B --> C["WS messages — persisted per ride"]
  B --> D["System messages — driver arrived, OTP wrong"]
  C --> E["Report message → moderation queue"]
  A --> F["Ride ends — thread archived (24h masked-call/chat expiry)"]
```

## C. TRUST, SAFETY & SUPPORT

### F-09 · 🔨 Emergency SOS (customer + driver) — with responder chain

```mermaid
flowchart TD
  A["Hold-to-confirm ~1.5s + confirm sheet (UI debounce — backend keeps no-cooldown)"] --> B["Alert raised — alert ID shown"]
  B --> C["Status chain: raised → acknowledged → responding → resolved | false-alarm — VISIBLE in-app"]
  B --> D["Location shared — dispatch + trusted contacts (live link, 5-min TTL)"]
  B --> E["Call 999 button + optional audio recording (config)"]
  B --> F["Offline → queued, sent on reconnect — NEVER batched"]
  C -->|"Ack timeout"| G["Escalate — next tier / admin emergency path"]
  N2["Note: 10s polling exists because push is best-effort on Android — polling is the reliable fallback, offers/SOS are never batched"]
  N3["Auto-triggers (harsh-brake, prolonged no-motion) — P2 deferred (§15 D)"]
  C -->|"False alarm"| H["Closed + logged + user notified"]
  I["Counterparty banner semantics: rider SOS → driver sees alert banner; driver SOS → rider sees 'driver triggered an emergency — you may exit safely'"]
```

### F-10 · 🔨 Dispute / report issue / lost item

```mermaid
flowchart TD
  A["Ride detail — 'Report an issue — available 24h after ride' (shown)"] --> B["Lost item — masked direct call to driver BEFORE filing"]
  A --> C["Fare dispute / report issue — categorised + evidence (photos, GPS)"]
  C --> D["Status visible to BOTH parties"] --> E["Admin SLA — 72h"] --> F["Outcome + ledger adjustments"]
  C --> G["GPS anomaly auto-check — partial auto-credit before admin review"]
```

## D. MARKETPLACE — SHOPS, FOOD, WORKSHOPS, DELIVERY (Plan 27 🔨)

### F-11 · 🔨 Shop order → delivery dispatch (ALL categories — the canonical sequence)

```mermaid
sequenceDiagram
  participant U as Customer
  participant S as Shop (owner / staff)
  participant SYS as Dispatch system
  participant C as Courier (Delivery Man / Driver)
  U->>SYS: Place order — items + parcel class + COD total (offline → queued)
  SYS->>S: New order (shop closed → REJECTED server-side; response timeout → auto-reject + customer notified with reason)
  opt out of stock after accept
    S->>SYS: Partial — confirm missing items with customer (split or cancel)
  end
  opt customer edits before pickup
    U->>SYS: Address change / cancel — state-dependent fee
  end
  Note over U,S: customer ↔ shop chat — P2 deferred (§15 D)
  alt shop rejects — reason to customer
    S->>SYS: Reject (out of stock / closed early)
    SYS->>U: Order rejected + reason — nothing charged
  else shop accepts
    S->>SYS: Accept + prep-time picker (10/20/30 min)
    S->>SYS: Confirm assignment → preparing (dispatch starts at ready_time − travel_time)
    SYS->>SYS: Rank couriers — nearest → rating → subscription active (delivery men + drivers with toggle)
    loop sequential offers — 45s window × max 3 (platform_config)
      SYS->>C: Offer — shop, pickup, contact number, dropoff, ORDER VALUE, fee, parcel class
      C->>SYS: Accept (single-claim) / Reject / timeout
    end
    SYS->>S: Courier assigned — notified
    SYS->>U: Courier assigned — notified + ORDER TRACKING VIEW
    S->>S: Preparing → ready
    S->>C: Handover — 4-digit pickup CODE (shop shows, courier enters)
    C->>SYS: "Picked up" — valid only with matching code (liability shifts to courier)
    SYS->>S: Picked-up notification
    SYS->>U: Picked-up notification
    alt delivered
      C->>U: Deliver — collect items + fee (COD)
      C->>SYS: "Delivered" + AMOUNT COLLECTED (short-pay recorded → F-38)
      SYS->>S: Settlement credit — items (0% commission)
      SYS->>C: Earnings — fee (100%)
      SYS->>U: Receipt
    else failed / refused
      C->>SYS: Delivery failed + reason (receiver absent → call → wait → attempted)
      SYS->>S: Item returned → retry or self-deliver (F-12)
      SYS->>U: Notified — retry or cancel
    end
  end
  U->>SYS: Customer cancel — pre-pickup only, state-dependent fee (post-pickup: refuse-at-door → F-14 return path)
  U->>SYS: Dispute (wrong/missing item) → F-38
```

### F-12 · 🔨 Delivery exhaustion — retry, bump, self-deliver, cancel

```mermaid
flowchart TD
  A["Offers exhausted"] --> B0["First: retry-wait N min (config) → re-offer to refreshed courier pool"]
  B0 --> B{"Still nothing at 30-min timeout — shop chooses"}
  B -->|"Retry / bump fee (config)"| C["Re-offer at higher fee"]
  B -->|"Self-deliver"| D["Mark delivered-self — customer CONFIRMS receipt (dispute path F-38) — shop keeps the fee"]
  B -->|"Cancel"| E["Cancelled — customer notified WITH reason — no money moved (COD) — noted"]
```

### F-13 · 🔨 Workshop — products AND services (split lanes)

```mermaid
flowchart TD
  A["Workshop shop screen"] --> B["Products → courier delivery (F-11)"]
  A --> C["Service request — service + vehicle details + requested window"]
  C --> D{"Shop response — 2h SLA auto-decline"}
  D -->|"Confirm window"| E["In progress — extra-repair upsell: mechanic logs → customer approves cost in-app → resumes"] --> F["Done — customer confirms — COD at shop — settlement entry (service fee)"] --> G["Rate workshop"]
  D -->|"Auto-declined"| H["Customer notified — pick another window or cancel"]
  C --> I["Reschedule / mutual no-show — re-request"]
```

### F-14 · 🔨 P2P delivery (any role originates)

```mermaid
flowchart TD
  A["Any logged-in role — Send a parcel"] --> B["Prohibited-items declaration checkbox"]
  B --> B2["Parcel class: Small ≤5 kg (base tier) / Large-heavy or Fragile (higher tier) — stored on the request, shown to the courier"]
  B --> C["Pickup + dropoff + item note + DECLARED VALUE (cap; liability = declared)"]
  C --> D["Receiver phone verification + payer choice: receiver-pays (default, cash on delivery) / sender-pays (cash at pickup)"]
  D --> D2["Non-app receiver gets the delivery CODE via SMS"]
  D --> E["Fee tier — fresh-read platform_config (launch: 80 within 3 km / 120 beyond)"]
  E --> F["Dispatch engine (F-11 offers)"]
  F --> G{"Delivered?"}
  G -->|"Yes — proof: photo + receiver OTP"| H["Entries + notifications"]
  G -->|"Receiver refuses fee / absent"| I["Return-to-originator — return fee applies — originator notified"]
  G -->|"Chain exhausted"| J["Originator notified — request cancelled"]
```

### F-15 · 🔨 Delivery Man day (and Driver with Deliveries toggle ON)

```mermaid
flowchart TD
  A["Login as Delivery Man"] --> B["Online gates: location permission ON (denied → forced offline + banner) · subscription active (expired → read-only inbox, no accept)"]
  B --> C["Dispatched-offers inbox — one offer at a time (mid-delivery ride offers EXCLUDED — one active job)"]
  C --> D{"Response — 45s window"}
  D -->|"Accept"| E["Pickup code entry → picked up → attempted-delivery state if receiver absent (call → wait → return/second attempt) → delivery PROOF (photo or receiver OTP) → delivered + amount-collected entry"] --> F["Earnings — fee × 100%"]
  E --> C
  F --> FR["Delivery rating — feeds courier dispatch ranking"]
  D -->|"Reject / timeout"| C
  F --> G["Subscription ৳100/month — see F-35"]
  X["Driver — Deliveries toggle ON"] --> C
  X -->|"Carrying a rider"| Y["Deliveries auto-OFF while on-trip"]
```

### F-16 · 🔨 Shop Owner / Staff day (SPLIT views — staff is orders-only)

```mermaid
flowchart TD
  A["Login as Shop OWNER"] --> B["Full dashboard — orders by state"]
  B --> C["New order — accept (with PREP-TIME PICKER 10/20/30) / reject with reason — 2-min timeout auto-rejects"]
  C --> D["Preparing → ready → handover code to courier (F-11)"]
  B --> E["Catalog — products CRUD, availability"]
  B --> F["Workshop requests inbox — 2h SLA (F-13)"]
  B --> G["Staff — invite by phone"]
  B --> H["Open/Closed toggle + business-hours auto-schedule"]
  B --> I["Busy mode — throttles new orders (accept one at a time)"]
  B --> J["Settlement — daily cutoff"]
  A2["Login as STAFF"] --> B2["ORDERS-ONLY dashboard — accept/prepare/ready/handoff — banner: Acting as staff · Shop name"]
  B2 -.->|"NO access: catalog, payouts, staff, settlement"| B
```

## E. FLEET (RENTAL + AMBULANCE) & OWNER/DISPATCHER

### F-17 · 🔨 Fleet Owner — onboarding → dashboard

```mermaid
flowchart TD
  A["Register as Fleet Owner"] --> B["Business + fleet docs → admin verifies"] --> C["Fleet dashboard"]
  C --> D["Add vehicles"] --> E["Invite drivers by phone"]
  E --> F{"Driver has account?"}
  F -->|"Existing — WITH driver consent"| G["Role expanded — no second account"]
  F -->|"Already in another fleet"| G2["REJECTED — single-fleet rule"]
  F -->|"New"| H["Driver onboarding — docs → platform verifies"]
  G --> I["Assign vehicle ↔ driver — unassign returns vehicle to pool"]
  H --> I
  C --> J["Rental bids — submit/track"]
  C --> K["Ambulance requests — accept"]
  C --> L["Fleet statement"]
  C --> M["Invite Dispatcher — no payouts (server-enforced)"]
  I --> N["Remove driver — settle dues → vehicle returns to pool"]
  L --> O["Payout split owner ↔ driver — config (§12)"]
```

### F-18 · 🔨 Car rental — request → broadcast → bid → award → lifecycle (V2)

```mermaid
sequenceDiagram
  participant U as Customer
  participant SYS as Dispatch system
  participant F as Fleet Owner / Dispatcher
  U->>SYS: Rental request — NOW/SCHEDULED, duration, car class, options
  SYS->>F: Broadcast to zone fleets (eligible type)
  alt zero bids at close
    SYS->>U: No bids — relax class or cancel (customer notified, friendly copy)
  else bids received
    F->>SYS: Sealed bid (withdrawable before close)
    SYS->>U: Bids ready (sealed until close)
    U->>SYS: Accept a bid
    SYS->>F: Awarded — 5-minute SLA
    alt fleet acknowledges in SLA
      F->>SYS: Acknowledge → confirm
      SYS->>U: Confirmed — assignment tracking
      F->>U: Handover → rental period
      U->>F: Return — late/extension fees → damage/deposit dispute → settlement
      U->>SYS: Cancel post-award — fee per stage
    else SLA expires
      SYS->>U: "Fleet didn't respond in time — confirm another bid or re-request"
    end
  end
```

### F-19 · 🔨 Ambulance — emergency request (V7)

```mermaid
flowchart TD
  A["Emergency request — location + need"] --> B["999 national hotline shown IN PARALLEL at request time"]
  B --> C["Broadcast to certification + equipment-checked ambulance fleets"]
  C --> D{"Ack within 60s — immediate ack shows ETA"}
  D -->|"Accepted"| E["Assigned — LIVE vehicle location to requester — en route → on scene → hospital transport (multi-stop) → complete"]
  D -->|"60s silence"| F["Escalate — next fleet + requester notified of delay"]
  E --> G["Patient privacy — minimal info shared; hospital pre-notified"]
  A --> H["Requester cancel — before accept, no penalty"]
```

## F. DRIVER LIFECYCLE

### F-20 · 🔨 Driver subscription (packages) — role-filtered, grant-source shown

```mermaid
flowchart TD
  A["Driver — subscription screen"] --> B["Plans VISIBLE = role-filtered (driver plans only)"]
  B --> C["launch_free shown as: Free launch access · GRANTED · expiry + renew terms"]
  C --> D{"Payments ON?"}
  D -->|"OFF at launch"| E["Comped/granted — offers active"]
  D -->|"ON later"| F["launch_free cutover: grace period → then checkout (PortPos)"]
  F --> G{"Callback — idempotent"}
  G -->|"Verified"| H["Active"]
  G -->|"Failed / abandoned checkout"| I["PENDING state — retry"]
  E -->|"Expiry T-3 days"| J["Offers PAUSED — banner — pay / get comp"]
```

### F-21 · 🔨 Driver earnings, dues & payouts — repay channels NAMED

```mermaid
flowchart TD
  A["Earnings — rides + delivery legs (source-tagged)"] --> B["Breakdown per ride/leg"]
  A --> C["Due amounts — commissions owed (debit-on-offer)"]
  C --> D{"Repay — NAMED CHANNELS: office cash / bKash agent / auto-deduct from earnings credit"}
  D --> E["Overdue > threshold → reminders → DISPATCH HOLD"]
  A --> F["Commission statement — export CSV/PDF"]
  A --> G["Disputed earning → admin queue (F-10 path)"]
```

### F-22 · 🔨 Driver vehicle management & min-rate

```mermaid
flowchart TD
  A["Vehicle management — my vehicles"] --> B["Add / edit vehicle (type enum, docs)"]
  B --> C{"Docs expiring / expired?"}
  C -->|"Expiring T days"| D["Warning banner"]
  C -->|"Expired"| E["Offers BLOCKED — banner — re-submit docs"]
  B --> F["Vehicle-type change — request → admin queue (F-30) — approve/reject"]
  A --> G["Min-rate — bounded by platform floor"]
```

### F-23 · 🔨 Driver performance, hotspots, promos, referral

```mermaid
flowchart TD
  A["Performance stats — acceptance, completion, ratings"] --> B["LOW RATING over N weeks → dispatch DE-PRIORITIZED (shown to driver)"]
  A --> C["Hotspot map — aggregated zone-level (opt-in view)"]
  A --> D["Driver promos — applicable campaigns"]
  A --> E["Referral — anti-fraud: device + bank + IP dedupe; reward REVERSED on refunded ride"]
```

### F-24 · 🔨 Break mode, safety center, support

```mermaid
flowchart TD
  A["Break mode — pauses BOTH ride and delivery offers"] --> B["Auto-end after X hours (config)"] --> C["Resume — presence restored"]
  D["Safety center — emergency contacts (multiple)"] --> E["SOS (F-09)"]
  F["Support — FAQ + ticket with SLA + status"]
```

### F-25 · ⊘ MERGED into F-06 (driver-side no-show view). See F-06.

## G. CUSTOMER MONEY & GROWTH

### F-26 · 💤 Wallet top-up & rider passes (descoped — VISIBLE but disabled)

```mermaid
flowchart TD
  A["Wallet / passes entry"] --> B["Rendered as DISABLED rows: Coming soon — cash accepted now"]
  B --> C["Pass usage (granted via admin/promo — no purchase rail at launch)"]
  B -->|"When payments ON"| D["PortPos checkout → callback verifies → wallet/pass credited"]
```

### F-27 · 🔨 Apply promos (ride discounts)

```mermaid
flowchart TD
  A["Estimate — Apply promos"] --> B["Vehicle-type + coords sent — SERVER validates"]
  B --> C{"Eligible?"}
  C -->|"Yes — pass-first precedence, then promo"| D["Applied — fare adjusted"]
  C -->|"No — reason NAMES the failing criterion (vehicle type / zone / time / expired)"| E["Shown to user"]
```

### F-28 · 🔨 Customer referral — with anti-fraud

```mermaid
flowchart TD
  A["Referral — my code"] --> B["Share invite"] --> C["Referred signup + first ride"]
  C --> D["Anti-fraud — device + bank + IP dedupe"] --> E["Reward credited"]
  E -->|"Referred ride refunded"| F["Reward REVERSED"]
```

### F-29 · 🔨 Notifications — hub spec

```mermaid
flowchart LR
  A["Event sources — ride, delivery, shop order, subscription, promo, SOS"] --> B["Hub — SOS/offer/match NEVER batched; others batched + deduped"]
  B --> C["Push (Expo, Bangla locale) + in-app list + read/read-all"]
  B --> D["Per-category mutes (promos OFF by default) — token revocation on logout/role switch"]
  B --> E["SMS fallback for NON-APP receivers (P2P delivery code, ambulance link)"]
```

## H. ADMIN PANEL (web — Playwright lane, English-only)

### F-30 · 🔨 Admin verification queues — CANONICAL admin side (applicant side = F-03)

```mermaid
flowchart TD
  A["Verification dashboard — counts + SLA tracking"] --> B["Driver documents"]
  A --> C["Shop licenses (+food cert)"]
  A --> D["Fleet business docs"]
  A --> E["Delivery-man NID/license"]
  A --> E2["Vehicle-type change requests"]
  B --> F{"Decision — approve / reject (STRUCTURED reason: code + field + example) / bulk ops / internal notes vs applicant-visible reason"}
  C --> F
  D --> F
  E --> F
  E2 --> F
  F -->|"Approve"| G["Active — applicant notified"]
  F -->|"Reject"| H["Reason in-app — re-submit"]
  F --> I["audit_logs — actor, entity, decision"]
```

### F-31 · 🔨 Admin marketplace ops — ledger-consistent

```mermaid
flowchart TD
  A["Marketplace order browser — read + force-cancel"] --> A1["Force-cancel: reason CODE required + customer notified + ledger reversal (matches F-12)"]
  C["Shop types — add/edit/deactivate (shoptypes.manage)"] --> D["Good-morning updates with zero client change"]
  E["Monitoring — pending verifications, active shops, legs today, couriers online — alert thresholds (couriers < N)"]
  F["audit log export"]
```

### F-32 · 🔨 Admin fare & platform config — launch DEFAULTS, all editable, nothing hardcoded

```mermaid
flowchart TD
  A["Fare config — stages, zones, night multiplier, fuel engine"] --> B["PATCH config — versioned + rollback + validation (no negatives, no zero-radius) — effect: next quote/order (in-flight work keeps its SNAPSHOT — R-A9)"]
  C["Delivery economics — commission 0%, fee tiers 80/120, radius 3 km, subscription 100 — LAUNCH DEFAULTS"] --> B
  D["Subscription plans — create/edit/suspend/delete (role multi-select; delete blocked with active subscribers; mid-cycle edit grandfathered)"] --> B
  B --> E["All values fresh-read platform_config at request time"]
```

## I. NEW FLOWS (Plan 27 §12/§14/§15)

### F-33 · 🔨 COD collection & remittance — the settlement core

```mermaid
flowchart TD
  A["Courier collects COD — item value + fee in cash"] --> B["Courier cash-liability entry: +items, −fee earned"]
  B --> C{"Remit — mobile banking / bKash agent / office cash drop"}
  C --> D["Platform reconciles vs order value"] --> E{"Match?"}
  E -->|"Yes"| F["Shop settlement — items credited (0% commission)"]
  E -->|"Short / dispute"| G["Admin queue (F-10 style) — adjustment + audit_logs"]
  B --> H{"Overdue > threshold?"}
  H -->|"Yes"| I["Reminders → DISPATCH HOLD → admin enforcement"]
  H -->|"No"| B
```

### F-34 · 🔨 Invite acceptance — shop staff & fleet dispatcher

```mermaid
flowchart TD
  A["Owner invites by phone (F-16 / F-17)"] --> B{"Invitee has an account?"}
  B -->|"Yes — WITH consent"| C["Accept invite — sub-role attached (no admin gate)"]
  B -->|"No"| D["Register via invite — phone + OTP (customer-grade)"] --> C
  C --> E["Login as → scoped dashboard (staff: orders-only · dispatcher: no payouts)"]
  F["Owner revokes / member leaves"] --> G["Role detached — access ends immediately — dues settled first"]
```

### F-35 · 🔨 Courier subscription — Delivery Man + driver-courier

```mermaid
flowchart TD
  A["Delivery Man / driver-courier — subscription screen (role-filtered)"] --> B{"Payments ON?"}
  B -->|"OFF — launch"| C["৳100 plan comped — dispatch-eligible — GRANT SOURCE shown"]
  B -->|"ON"| D["Checkout — PortPos webview"] --> E{"Callback — idempotent"}
  E -->|"Verified"| F["Active — included in dispatch ranking"]
  E -->|"Failed / abandoned"| G["Pending — retry (not blocked while comped)"]
  H["Expiry T-3 days"] --> I["Grace period"] --> J{"Renewed?"}
  J -->|"Yes"| F
  J -->|"Past grace"| K["EXCLUDED from courier ranking — renewal reminders"]
```

### F-36 · 🔨 Account & device management

```mermaid
flowchart TD
  A["Settings — Account"] --> B["Change phone — OTP to NEW number (roles stay with the internal ID)"]
  A --> C["Device sessions — list + revoke single / log out everywhere"]
  A --> D["Delete account — data purge per policy (dues/settlements must be zero)"]
  A --> E["Data export"]
```

### F-38 · 🔨 Cash receipt & dispute (cash handshake sub-flow — referenced by F-05/F-11/F-33)

```mermaid
flowchart TD
  A["COD handover — cash exchanged"] --> B["Handler enters amount received"]
  B --> C{"Amount matches?"}
  C -->|"Yes"| D["Closed — receipt to payer"]
  C -->|"Short"| E["Shortfall recorded (who was short, amount) → visible in settlement (F-33) — prevents 'never paid' disputes"]
  C -->|"Over"| F["Change recorded"]
  A --> G{"Payer disputes later"} --> H["Admin queue (F-10 pattern) — evidence: entries + timestamps"]
```

## J. STATE-MACHINE APPENDIX (canonical vocabulary)

### Shop order + delivery leg

```mermaid
stateDiagram-v2
  [*] --> Placed: customer checkout (COD)
  Placed --> Accepted: shop accepts (2-min timeout → auto-reject)
  Placed --> Rejected: shop rejects with reason
  Placed --> CancelledByCustomer: pre-pickup cancel (state-dependent fee)
  Accepted --> Preparing: prep-time set
  Preparing --> Dispatching: at ready_time − travel_time
  Dispatching --> CourierAssigned: accept (single-claim)
  Dispatching --> Exhausted: chain done
  Exhausted --> SelfDelivery: shop choice (customer confirms)
  Exhausted --> CancelledByShop: reversal + reason
  CourierAssigned --> ReadyForPickup
  ReadyForPickup --> PickedUp: handover CODE
  PickedUp --> Delivered: COD collected (amount entry)
  PickedUp --> Failed: receiver absent / refuses
  Failed --> Returned: return to shop
  Delivered --> [*]
  Returned --> [*]
  CancelledByCustomer --> [*]
  CancelledByShop --> [*]
  SelfDelivery --> [*]
```

### Ride (stage-aware) — see F-04/F-05; states: requested → matched → started → in-progress → completed | cancelled | no-show (fee via F-33 dues)
### Subscription — see F-20/F-35; states: active → grace → paused/expired (payments ON/OFF branches)
### Verification — see F-01/F-03/F-30; states: pending → under-review → approved | rejected(resubmit ×3) | suspended
### SOS — see F-09; states: raised → acknowledged → responding → resolved | false-alarm
### Dispute — see F-10/F-38; states: filed → under-review → resolved | rejected

---

## COVERAGE MAP (one primary plan section per diagram)

| Diagrams | Primary plan section |
|---|---|
| F-01, F-02, F-03 | §2 auth/roles + §7 queues (F-03 applicant ↔ F-30 admin) |
| F-04–F-08, F-25(merged) | §13 S4/S6 (V1 ride ops) |
| F-09, F-10, F-38 | Trust/support (FEATURES §1) + §7 |
| F-11–F-16 | §3/§5/§6.1/§12 (marketplace + delivery dispatch) |
| F-17–F-19 | §4 (fleet) + V2/V7 |
| F-20, F-21, F-22, F-23, F-24 | §13 S6 (driver lifecycle) + §14 |
| F-26–F-29 | FEATURES §1 (customer money/growth) + §14 |
| F-30–F-32 | §7 (admin) + §14 |
| F-33–F-36, F-38 | §12 (settlement) + §2 (invites) + §14 |
