# Cancellation Fee Compensation Model — Spec
# =============================================================================
# Business model (user-confirmed 2026-08-01):
#
# When a rider cancels after match:
# 1. Cancellation fee charged to rider (deducted from rider wallet ledger)
# 2. Fee NOT taxed
# 3. Fee is NOT cash to anyone — it's a ledger adjustment
# 4. Next driver who picks up this rider gets the fee added to their fare
#    (shown as "cancellation bonus" in offer sheet + receipt)
# 5. Next driver pays slightly more commission (because fare is higher)
# 6. ORIGINAL driver (who got cancelled on) sees the fee as a CREDIT
#    in their wallet ledger — "Cancellation compensation"
# 7. Original driver gets the credit as DISCOUNT on next package purchase
#    or commission payment
# 8. Both wallets are ledger-only (no withdrawal, no cashout)
#
# This creates a fair system:
# - Original driver is compensated for wasted time (via future discount)
# - Next driver earns more (incentive to pick up cancelled riders)
# - Platform earns slightly more commission on the higher fare
# - Rider pays for their cancellation behavior
# =============================================================================

## Schema additions

### rides table — ADD COLUMNS:
  cancellation_fee_bdt: integer (already exists)
  cancellation_compensation_driver_id: uuid nullable
    -- the ORIGINAL driver who was cancelled on (gets the credit)
  cancellation_fee_applied: boolean default false
    -- set true when the fee is applied to a subsequent ride

### New table: cancellation_credits
  id uuid PK
  original_driver_id uuid FK drivers
  cancellation_ride_id uuid FK rides (the cancelled ride)
  amount_bdt integer (paisa)
  status: text enum ['pending', 'applied', 'expired']
  applied_to_ride_id uuid FK rides nullable (the next ride where it was used)
  applied_at timestamp nullable
  expires_at timestamp (30 days)
  created_at timestamp

## Flow

### Phase 1: Rider cancels (cancel+api.ts)
When cancellation fee > 0:
1. Deduct fee from rider wallet (existing — already done)
2. Create cancellation_credits row:
   - original_driver_id = ride.driver_id (the cancelled-on driver)
   - cancellation_ride_id = ride.id
   - amount_bdt = feeBdt
   - status = 'pending'
   - expires_at = now + 30 days
3. Insert driverWalletTransactions row for original driver:
   - type = 'cancellation_compensation'
   - amount = +feeBdt (credit, positive)
   - description = "Cancellation compensation from ride {id}"
   - is_withdrawable = false (it's a discount credit, not cash)

### Phase 2: Rider requests again (request+api.ts)
When the SAME rider requests a new ride (within 30 days of cancellation):
1. Check for pending cancellation_credits WHERE:
   - original_driver_id = (any — we need the rider's previous cancellation)
   Actually: check if THIS rider has a pending cancellation credit from a recent cancel.
   
   REVISED: The credit goes to the ORIGINAL DRIVER, not tied to the rider.
   The next driver is whoever picks up the rider next.
   
   SIMPLER MODEL:
   - The cancellation fee is added to the NEXT ride's fare as a bonus
   - The original driver's credit is separate (they get a discount on their next package)
   
   So Phase 2 is actually:
   - When rider requests a new ride after cancelling:
     - Check rides table for their most recent cancelled ride with cancellation_fee_bdt > 0
     - If found and not yet applied:
       - Add cancellation_fee_bdt to the new ride's fare estimate
       - Show rider: "৳{fee} cancellation fee from your previous cancelled ride"
       - Mark the old ride's cancellation_fee_applied = true
       - Store cancellation_compensation_driver_id = old ride's driver_id on new ride

### Phase 3: Next driver accepts (dispatch + offer)
- Ride offer shows: base fare + cancellation bonus
- Driver sees "includes ৳{fee} cancellation bonus" in offer sheet
- When driver accepts, their fare includes the bonus
- Commission calculated on total (including bonus) — driver pays slightly more
  BUT the bonus more than offsets the extra commission

### Phase 4: Ride completes (complete+api.ts)
- Driver gets full fare (including cancellation bonus) in their ledger
- The cancellation credit for the ORIGINAL driver is already in their ledger
  from Phase 1
- No additional action needed at completion

### Phase 5: Original driver buys package (package/purchase+api.ts)
- Check for pending cancellation_credits WHERE original_driver_id = driver.id
  AND status = 'pending'
- Apply as discount: package_price -= credit_amount
- Mark credit as 'applied'
- Show driver: "৳{credit} cancellation compensation applied"

OR: Apply at commission calculation (complete+api.ts):
- When calculating commission for the ORIGINAL driver's rides:
  - Check for pending credits
  - Reduce commission by credit amount (min 0)
  - Mark credit as 'applied'

## API additions

- GET /api/driver/cancellation-credits
  Returns: pending credits for the driver (amount, from ride, expires_at)
  
- No rider API needed — the fee is applied automatically

## UI

### Driver wallet screen:
- Show "Cancellation Compensation" section
- List pending credits: "৳{amount} from cancelled ride on {date} — expires in {days} days"
- Total pending compensation shown separately from earnings balance

### Next driver's offer sheet:
- "💰 Includes ৳{fee} cancellation bonus" badge
- Fare breakdown shows the bonus line

### Rider confirm-ride:
- "Cancellation fee: ৳{fee} (from previous cancelled ride)"
- Added to total payable

## Scheduler
- Daily job: expire cancellation_credits WHERE status='pending' AND expires_at < now
- Expired credits: insert driverWalletTransactions row (type='adjustment', amount=-credit)
  to reverse the ledger entry
