import { and, eq, inArray, isNull, or, sql, sum } from "drizzle-orm";
import { db } from "@/src/db";
import { getDriverUnpaidObligations } from "@/lib/commissionDues";
import {
  ambulanceCertifications,
  awardedBidAssignments,
  courierRemittanceDues,
  deliveries,
  deliveryRequests,
  drivers,
  emergencyRequests,
  rentalRequests,
  riderAddresses,
  rides,
  shopLedger,
  shopOrders,
  shops,
  users,
  workshopRequests,
} from "@/src/db/schema";

/** DB tx handle type (same shape leadBilling uses). */
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DuesKind = "driver_commission" | "courier_remittance" | "shop_settlement";

export interface DuesFailure {
  kind: DuesKind;
  amount_bdt: number;
}

/**
 * C2-4 (STAGE C2-FIX) — phone tombstone.
 *
 * `users.phone` is varchar(20) NOT NULL UNIQUE, so the tombstone must fit 20
 * chars AND stay unique per account: `deleted:` (8) + the first 12 hex chars
 * of the row id (dashes stripped). The order's literal `deleted: + id` cannot
 * fit a 36-char uuid into varchar(20); the 12-hex suffix (48 bits) keeps the
 * prefix the order names while staying unique and idempotent (same row →
 * same tombstone, so a second delete never hits the 23505 class).
 */
export function tombstonePhone(id: string): string {
  return `deleted:${id.replace(/-/g, "").slice(0, 12)}`;
}

/**
 * DUES-ZERO precondition: driver unpaid obligations (open subscription bills +
 * net commission dues from driver_unpaid_obligations) must be below the
 * ৳10 settlement minimum before the account can be deleted — dust-aligned so
 * sub-৳10 never strands deletion; courier COD remittance and owned-shop
 * settlement balances must also be zero. Returns the first outstanding due,
 * or null when deletion may proceed. Runs inside the caller's transaction.
 */
export async function checkDeleteDues(tx: DbTx, userId: string): Promise<DuesFailure | null> {
  const [driver] = await tx
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);
  if (driver) {
    const obligations = await getDriverUnpaidObligations(tx, driver.id);
    if (obligations.totalUnpaidPaisa >= 1000) {
      return { kind: "driver_commission", amount_bdt: obligations.totalUnpaidPaisa };
    }
  }

  const [remit] = await tx
    .select({ total: sql<number>`COALESCE(SUM(${courierRemittanceDues.amount_bdt}), 0)` })
    .from(courierRemittanceDues)
    .where(
      and(
        eq(courierRemittanceDues.delivery_man_user_id, userId),
        eq(courierRemittanceDues.status, "pending"),
      ),
    );
  if (Number(remit?.total ?? 0) > 0) {
    return { kind: "courier_remittance", amount_bdt: Number(remit?.total ?? 0) };
  }

  const owned = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.owner_user_id, userId));
  if (owned.length > 0) {
    const [bal] = await tx
      .select({ balance: sum(shopLedger.amount_bdt) })
      .from(shopLedger)
      .where(
        inArray(
          shopLedger.shop_id,
          owned.map((s) => s.id),
        ),
      );
    if (Number(bal?.balance ?? 0) !== 0) {
      return { kind: "shop_settlement", amount_bdt: Number(bal?.balance ?? 0) };
    }
  }

  return null;
}

// ── Active-commitment gate (§A6) ────────────────────────────────────────
// Deleting an account mid-service strands a live ride/order and its driver
// or courier, so every non-terminal state across the five service verticals
// blocks deletion. Status lists are pinned to the live enums in
// src/db/schema.ts — terminal states only are excluded.

export type CommitmentKind =
  | "ride_active"
  | "shop_order_active"
  | "workshop_booking_active"
  | "rental_active"
  | "emergency_active"
  | "delivery_active"
  | "delivery_request_active";

export interface CommitmentFailure {
  kind: CommitmentKind;
}

// rideStatusEnum minus completed/cancelled/expired/no_drivers.
const RIDE_ACTIVE = [
  "pending",
  "dispatching",
  "matched",
  "driver_arriving",
  "driver_arrived",
  "in_progress",
  "scheduled",
] as const;

// shopOrderStatusEnum minus delivered/cancelled/refunded/done/self_delivered.
const SHOP_ORDER_ACTIVE = [
  "pending",
  "accepted",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "booked",
  "confirmed",
  "in_progress",
  "dispatched",
  "courier_assigned",
  "picked_up",
] as const;

// workshopRequestStatusEnum minus done/declined.
const WORKSHOP_ACTIVE = ["requested", "confirmed", "in_progress"] as const;

// rentalRequestStatusEnum minus completed/cancelled/expired/no_bidders.
const RENTAL_ACTIVE = ["broadcasting", "collecting", "awarded", "confirmed"] as const;

// emergencyStatusEnum minus completed/cancelled/failed.
const EMERGENCY_ACTIVE = [
  "broadcasting",
  "assigned",
  "en_route_pickup",
  "arrived",
  "en_route_dropoff",
] as const;

// deliveryLegStatusEnum minus delivered/failed.
const DELIVERY_ACTIVE = ["created", "offered", "accepted", "picked_up"] as const;

// deliveryStatusEnum minus delivered/failed/cancelled.
const DELIVERY_REQUEST_ACTIVE = ["pending", "assigned", "picked_up", "in_transit"] as const;

/**
 * ACTIVE-COMMITMENT precondition: no non-terminal booking/order may exist in
 * any vertical, in any role the account holds (customer, driver, courier,
 * merchant). Returns the first blocking kind, or null when nothing is live.
 * Runs inside the caller's transaction.
 */
export async function checkActiveCommitments(
  tx: DbTx,
  userId: string,
): Promise<CommitmentFailure | null> {
  const [driver] = await tx
    .select({ id: drivers.id })
    .from(drivers)
    .where(eq(drivers.user_id, userId))
    .limit(1);
  const ownedShops = await tx
    .select({ id: shops.id })
    .from(shops)
    .where(eq(shops.owner_user_id, userId));
  const ownedShopIds = ownedShops.map((s) => s.id);

  // 1. Rides — as rider, or as the assigned driver.
  const [ride] = await tx
    .select({ id: rides.id })
    .from(rides)
    .where(
      and(
        driver
          ? or(eq(rides.user_id, userId), eq(rides.driver_id, driver.id))
          : eq(rides.user_id, userId),
        inArray(rides.status, [...RIDE_ACTIVE]),
      ),
    )
    .limit(1);
  if (ride) return { kind: "ride_active" };

  // 2. Shop orders — as customer, courier, or the owning merchant.
  const orderScopes = [
    eq(shopOrders.rider_user_id, userId),
    eq(shopOrders.courier_user_id, userId),
  ];
  if (ownedShopIds.length > 0) {
    orderScopes.push(inArray(shopOrders.shop_id, ownedShopIds));
  }
  const [order] = await tx
    .select({ id: shopOrders.id })
    .from(shopOrders)
    .where(
      and(
        or(...orderScopes),
        inArray(shopOrders.status, [...SHOP_ORDER_ACTIVE]),
      ),
    )
    .limit(1);
  if (order) return { kind: "shop_order_active" };

  // 3. Workshop bookings — as customer, or the owning merchant.
  const workshopScopes = [eq(workshopRequests.customer_user_id, userId)];
  if (ownedShopIds.length > 0) {
    workshopScopes.push(inArray(workshopRequests.shop_id, ownedShopIds));
  }
  const [booking] = await tx
    .select({ id: workshopRequests.id })
    .from(workshopRequests)
    .where(
      and(
        or(...workshopScopes),
        inArray(workshopRequests.status, [...WORKSHOP_ACTIVE]),
      ),
    )
    .limit(1);
  if (booking) return { kind: "workshop_booking_active" };

  // 4. Rentals — as requesting customer, or as the driver on a live award.
  const [rental] = await tx
    .select({ id: rentalRequests.id })
    .from(rentalRequests)
    .where(
      and(
        eq(rentalRequests.rider_user_id, userId),
        inArray(rentalRequests.status, [...RENTAL_ACTIVE]),
      ),
    )
    .limit(1);
  if (rental) return { kind: "rental_active" };
  const [award] = await tx
    .select({ id: awardedBidAssignments.id })
    .from(awardedBidAssignments)
    .where(
      and(
        eq(awardedBidAssignments.assigned_driver_user_id, userId),
        isNull(awardedBidAssignments.released_at),
      ),
    )
    .limit(1);
  if (award) return { kind: "rental_active" };

  // 5. Emergency/ambulance — as caller, or as the accepting crew.
  const certs = await tx
    .select({ id: ambulanceCertifications.id })
    .from(ambulanceCertifications)
    .where(eq(ambulanceCertifications.user_id, userId));
  const emergencyScopes = [eq(emergencyRequests.caller_user_id, userId)];
  if (certs.length > 0) {
    emergencyScopes.push(
      inArray(
        emergencyRequests.accepted_cert_id,
        certs.map((c) => c.id),
      ),
    );
  }
  const [emergency] = await tx
    .select({ id: emergencyRequests.id })
    .from(emergencyRequests)
    .where(
      and(
        or(...emergencyScopes),
        inArray(emergencyRequests.status, [...EMERGENCY_ACTIVE]),
      ),
    )
    .limit(1);
  if (emergency) return { kind: "emergency_active" };

  // 6. Delivery legs — as customer, assigned courier, or outstanding offeree.
  const [leg] = await tx
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(
      and(
        or(
          eq(deliveries.dropoff_user_id, userId),
          eq(deliveries.delivery_man_user_id, userId),
          eq(deliveries.offered_to_user_id, userId),
        ),
        inArray(deliveries.status, [...DELIVERY_ACTIVE]),
      ),
    )
    .limit(1);
  if (leg) return { kind: "delivery_active" };

  // 7. Parcel delivery requests — as the requesting customer.
  const [parcel] = await tx
    .select({ id: deliveryRequests.id })
    .from(deliveryRequests)
    .where(
      and(
        eq(deliveryRequests.created_by_user_id, userId),
        inArray(deliveryRequests.status, [...DELIVERY_REQUEST_ACTIVE]),
      ),
    )
    .limit(1);
  if (parcel) return { kind: "delivery_request_active" };

  return null;
}

export type DeleteBlock =
  | { type: "dues"; dues: DuesFailure }
  | { type: "active_booking"; commitment: CommitmentFailure };

/**
 * The single deletion/phone-change precondition: zero unpaid dues AND no
 * active service commitment. Callers translate the block into their own
 * response shape; the checks run in the caller's transaction.
 */
export async function checkDeleteEligibility(
  tx: DbTx,
  userId: string,
): Promise<DeleteBlock | null> {
  const dues = await checkDeleteDues(tx, userId);
  if (dues) return { type: "dues", dues };
  const commitment = await checkActiveCommitments(tx, userId);
  if (commitment) return { type: "active_booking", commitment };
  return null;
}

/**
 * Shared 409 body for the two deletion routes (DELETE /api/user/account and
 * the legacy POST /api/user/delete-data), so the app sees one contract:
 * `amount_bdt` is integer paisa; `kind` names the blocking due/booking.
 */
export function deletionBlockedResponse(block: DeleteBlock): Response {
  if (block.type === "active_booking") {
    return Response.json(
      {
        error: "active_booking",
        message: "Finish or cancel your active booking before deleting your account",
        kind: block.commitment.kind,
      },
      { status: 409 },
    );
  }
  return Response.json(
    {
      error: "dues_outstanding",
      message: "Outstanding dues must be settled before deletion",
      kind: block.dues.kind,
      amount_bdt: block.dues.amount_bdt,
    },
    { status: 409 },
  );
}

/**
 * PII scrub + tombstone + deleted_at inside the caller's transaction. Also
 * scrubs the address PII the delete-data flow owned (rider_addresses +
 * ride endpoints), so the two surfaces share one writer.
 */
export async function scrubAccountTx(tx: DbTx, userId: string): Promise<{ phone: string }> {
  const phone = tombstonePhone(userId);
  const now = new Date();
  await tx
    .update(users)
    .set({
      name: "[deleted]",
      phone,
      email: null,
      profile_image_url: null,
      device_id: null,
      sos_contact: null,
      notification_prefs: null,
      security_settings: null,
      linked_accounts: null,
      data_controls: null,
      suspension_reason: null,
      deleted_at: now,
      updated_at: now,
    })
    .where(eq(users.id, userId));
  await tx
    .update(riderAddresses)
    .set({ address: "[deleted]", details: null, deleted_at: now, updated_at: now })
    .where(eq(riderAddresses.user_id, userId));
  await tx
    .update(rides)
    .set({ origin_address: "[deleted]", destination_address: "[deleted]" })
    .where(eq(rides.user_id, userId));
  return { phone };
}
