/**
 * roleVerification.ts — the §7 admin verification queue for the three
 * verification-gated launch roles (Shop Owner, Fleet Owner, Delivery Man).
 *
 * Modelled on the driver-documents queue (§7 names it the pattern), with one
 * deliberate difference: driver documents are their own `documents` rows, while
 * these three entities carry their documents on their own record — so the
 * REVIEW STATE lives in dedicated `verification_*` columns instead of being
 * overloaded onto the operational status.
 *
 * Two axes, on purpose:
 *   - operational `status`   — can this entity DO things (shops 'pending' →
 *     'active', fleets 'PENDING' → 'ACTIVE', couriers 'pending' → 'active').
 *   - `verification_status`  — where the ADMIN REVIEW stands
 *     (pending → approved | rejected). A reject keeps the operational status
 *     untouched (the role never silently goes live) and stores the reason the
 *     applicant sees in-app (R6), which they can RESUBMIT against.
 *
 * WRITE OWNERSHIP: the admin routes are the only writers of the decision
 * columns, and every decision lands in `audit_logs` (§7 A3) with actor, entity,
 * old/new values, ip and user agent.
 */
import { db } from '@/src/db';
// auditLogs stays imported for the ONE in-transaction audit write (the shared
// lib/auditLog writer is deliberately non-transactional); every other decision
// goes through writeSharedAudit below.
import { shops, fleets, fleetMembers, couriers, users, auditLogs } from '@/src/db/schema';
import { and, eq, asc, isNull } from 'drizzle-orm';
import { logger } from './logger';
// §7 A3 audit writer — one implementation for the whole admin surface (S7).
import { writeAudit as writeSharedAudit } from './auditLog';
// M-5 (§16): the resubmission carries the wizard's edited fields — shared
// payload shape + slug derivation live in launchRoles (no cycle: it never
// imports this module).
import { RoleRecordPayload, shopSlug } from './launchRoles';

export const VERIFICATION_KINDS = ['shop', 'fleet', 'delivery_man'] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export interface VerificationDocument {
  label: string;
  url: string | null;
}

export interface PendingVerification {
  id: string;
  applicant: { user_id: string; name: string; phone: string | null };
  /** Operational status — what the entity is allowed to do today. */
  status: string;
  /** Human summary the queue renders (shop/fleet name, vehicle note…). */
  label: string;
  documents: VerificationDocument[];
  created_at: Date | string;
}

export interface DecisionMeta {
  ip?: string | null;
  userAgent?: string | null;
}

function requestMeta(request: Request): DecisionMeta {
  const fwd = request.headers.get('x-forwarded-for');
  return {
    ip: fwd ? fwd.split(',')[0].trim() : null,
    userAgent: request.headers.get('user-agent'),
  };
}

function notFound(kind: VerificationKind): never {
  throw Object.assign(new Error(`${kind} not found or not pending`), { status: 404 });
}

function alreadyDecided(kind: VerificationKind): never {
  throw Object.assign(new Error(`${kind} verification already decided`), { status: 409 });
}

/** §7 queue: every record still awaiting an admin decision, oldest first. */
export async function listPending(kind: VerificationKind): Promise<PendingVerification[]> {
  if (kind === 'shop') {
    const rows = await db
      .select({
        id: shops.id,
        name: shops.name,
        status: shops.status,
        address_line: shops.address_line,
        license_url: shops.license_url,
        food_safety_cert_url: shops.food_safety_cert_url,
        created_at: shops.created_at,
        user_id: users.id,
        user_name: users.name,
        phone: users.phone,
      })
      .from(shops)
      .innerJoin(users, eq(shops.owner_user_id, users.id))
      .where(and(eq(shops.verification_status, 'pending'), isNull(shops.deleted_at)))
      .orderBy(asc(shops.created_at));

    return rows.map((r) => ({
      id: r.id,
      applicant: { user_id: r.user_id, name: r.user_name, phone: r.phone },
      status: r.status,
      label: `${r.name}${r.address_line ? ` — ${r.address_line}` : ''}`,
      documents: [
        { label: 'Trade license', url: r.license_url },
        { label: 'Food safety certificate', url: r.food_safety_cert_url },
      ],
      created_at: r.created_at,
    }));
  }

  if (kind === 'fleet') {
    const rows = await db
      .select({
        id: fleets.id,
        name: fleets.name,
        status: fleets.status,
        business_name: fleets.business_name,
        trade_license_number: fleets.trade_license_number,
        trade_license_url: fleets.trade_license_url,
        tax_doc_url: fleets.tax_doc_url,
        created_at: fleets.created_at,
        user_id: users.id,
        user_name: users.name,
        phone: users.phone,
      })
      .from(fleets)
      .innerJoin(users, eq(fleets.owner_user_id, users.id))
      .where(eq(fleets.verification_status, 'pending'))
      .orderBy(asc(fleets.created_at));

    return rows.map((r) => ({
      id: r.id,
      applicant: { user_id: r.user_id, name: r.user_name, phone: r.phone },
      status: r.status,
      label: `${r.name}${r.business_name ? ` — ${r.business_name}` : ''}${
        r.trade_license_number ? ` (license ${r.trade_license_number})` : ''
      }`,
      documents: [
        { label: 'Trade license', url: r.trade_license_url },
        { label: 'Tax document', url: r.tax_doc_url },
      ],
      created_at: r.created_at,
    }));
  }

  const rows = await db
    .select({
      id: couriers.id,
      status: couriers.status,
      nid_url: couriers.nid_url,
      license_url: couriers.license_url,
      vehicle_note: couriers.vehicle_note,
      created_at: couriers.created_at,
      user_id: users.id,
      user_name: users.name,
      phone: users.phone,
    })
    .from(couriers)
    .innerJoin(users, eq(couriers.user_id, users.id))
    .where(and(eq(couriers.verification_status, 'pending'), eq(couriers.courier_type, 'food')))
    .orderBy(asc(couriers.created_at));

  return rows.map((r) => ({
    id: r.id,
    applicant: { user_id: r.user_id, name: r.user_name, phone: r.phone },
    status: r.status,
    label: r.vehicle_note ? `Delivery man — ${r.vehicle_note}` : 'Delivery man',
    documents: [
      { label: 'NID', url: r.nid_url },
      { label: 'Driving license', url: r.license_url },
    ],
    created_at: r.created_at,
  }));
}

/** Approve: the role goes LIVE and the decision is audited (§7 A3). */
export async function approve(
  kind: VerificationKind,
  id: string,
  adminUserId: string,
  request: Request,
): Promise<{ id: string; user_id: string }> {
  const meta = requestMeta(request);

  if (kind === 'shop') {
    const [before] = await db
      .select({ status: shops.status, verification_status: shops.verification_status, owner: shops.owner_user_id })
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);
    if (!before) notFound('shop');
    if (before.verification_status !== 'pending') alreadyDecided('shop');

    const [updated] = await db
      .update(shops)
      .set({
        status: 'active',
        is_verified: true,
        verification_status: 'approved',
        verification_reason: null,
        verification_reject: null,
        verification_decided_at: new Date(),
        verification_decided_by: adminUserId,
        updated_at: new Date(),
      })
      .where(and(eq(shops.id, id), eq(shops.verification_status, 'pending')))
      .returning({ id: shops.id, owner: shops.owner_user_id });
    if (!updated) notFound('shop');

    await writeAudit({
      adminUserId,
      action: 'verification_shop_approved',
      entityType: 'shop',
      entityId: updated.id,
      oldValue: { status: before.status, verification_status: before.verification_status },
      newValue: { status: 'active', verification_status: 'approved' },
      meta,
    });
    return { id: updated.id, user_id: updated.owner };
  }

  if (kind === 'fleet') {
    const [before] = await db
      .select({ status: fleets.status, verification_status: fleets.verification_status, owner: fleets.owner_user_id })
      .from(fleets)
      .where(eq(fleets.id, id))
      .limit(1);
    if (!before) notFound('fleet');
    if (before.verification_status !== 'pending') alreadyDecided('fleet');

    // S2.1 M-1 (§16): UPDATE fleet + INSERT OWNER membership + audit land in
    // ONE transaction — a failed membership mint must not leave an ACTIVE
    // fleet whose owner has no fleet_members row (that row is the auth scope
    // for every fleet route, so the missing write alone bricks the surface).
    const decided = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(fleets)
        .set({
          status: 'ACTIVE',
          verification_status: 'approved',
          verification_reason: null,
          verification_reject: null,
          verification_decided_at: new Date(),
          verification_decided_by: adminUserId,
          updated_at: new Date(),
        })
        .where(and(eq(fleets.id, id), eq(fleets.verification_status, 'pending')))
        .returning({ id: fleets.id, owner: fleets.owner_user_id });
      if (!updated) notFound('fleet');

      // §2d: the OWNER membership is minted by approval ("→ admin verifies →
      // fleet + OWNER membership → dashboard"). Idempotent: the membership may
      // already exist if the fleet was created through another path.
      const existingMember = await tx
        .select({ id: fleetMembers.id })
        .from(fleetMembers)
        .where(and(eq(fleetMembers.fleet_id, updated.id), eq(fleetMembers.user_id, updated.owner)))
        .limit(1);
      if (existingMember.length === 0) {
        await tx.insert(fleetMembers).values({
          fleet_id: updated.id,
          user_id: updated.owner,
          role: 'OWNER',
          status: 'active',
        });
      }

      // Audit inside the transaction — unlike the swallow-below writeAudit
      // posture for the other kinds, a failed compliance write rolls the
      // whole decision back (money-adjacent lifecycle, §7 A3).
      await tx.insert(auditLogs).values({
        actor_user_id: adminUserId,
        action: 'verification_fleet_approved',
        entity_type: 'fleet',
        entity_id: updated.id,
        old_value: { status: before.status, verification_status: before.verification_status },
        new_value: { status: 'ACTIVE', verification_status: 'approved' },
        ip_address: meta.ip ?? null,
        user_agent: meta.userAgent ?? null,
      });

      return { id: updated.id, owner: updated.owner };
    });

    return { id: decided.id, user_id: decided.owner };
  }

  const [before] = await db
    .select({ status: couriers.status, verification_status: couriers.verification_status, owner: couriers.user_id })
    .from(couriers)
    .where(eq(couriers.id, id))
    .limit(1);
  if (!before) notFound('delivery_man');
  if (before.verification_status !== 'pending') alreadyDecided('delivery_man');

  const [updated] = await db
    .update(couriers)
    .set({
      status: 'active',
    verification_status: 'approved',
    verification_reason: null,
    verification_reject: null,
      verification_decided_at: new Date(),
      verification_decided_by: adminUserId,
      updated_at: new Date(),
    })
    .where(and(eq(couriers.id, id), eq(couriers.verification_status, 'pending')))
    .returning({ id: couriers.id, owner: couriers.user_id });
  if (!updated) notFound('delivery_man');

  await writeAudit({
    adminUserId,
    action: 'verification_delivery_man_approved',
    entityType: 'courier',
    entityId: updated.id,
    oldValue: { status: before.status, verification_status: before.verification_status },
    newValue: { status: 'active', verification_status: 'approved' },
    meta,
  });
  return { id: updated.id, user_id: updated.owner };
}

/**
 * Reject: the reason surfaces to the applicant in-app (R6) and the role stays
 * non-live. Resubmission (R6) clears it back to 'pending'.
 */
/** F-30 structured rejection: code + failed field + acceptable-doc example,
 *  plus an admin-only internal note. The applicant sees reason/field/example
 *  — never internal_note. */
export interface RejectDetails {
  reason: string;
  code?: string | null;
  field?: string | null;
  example?: string | null;
  internal_note?: string | null;
}

function rejectPayload(d: RejectDetails): Record<string, string | null> | null {
  if (!d.code && !d.field && !d.example && !d.internal_note) return null;
  return { code: d.code ?? null, field: d.field ?? null, example: d.example ?? null, internal_note: d.internal_note ?? null };
}

export const MAX_RESUBMITS = 3; // F-03: "max 3, then admin unblock"

export async function reject(
  kind: VerificationKind,
  id: string,
  adminUserId: string,
  details: RejectDetails,
  request: Request,
): Promise<{ id: string; user_id: string }> {
  const reason = details.reason;
  const meta = requestMeta(request);

  if (kind === 'shop') {
    const [before] = await db
      .select({ status: shops.status, verification_status: shops.verification_status, owner: shops.owner_user_id })
      .from(shops)
      .where(eq(shops.id, id))
      .limit(1);
    if (!before) notFound('shop');
    if (before.verification_status !== 'pending') alreadyDecided('shop');

    const [updated] = await db
      .update(shops)
      .set({
        verification_status: 'rejected',
        verification_reason: reason,
        verification_reject: rejectPayload(details),
        verification_decided_at: new Date(),
        verification_decided_by: adminUserId,
        updated_at: new Date(),
      })
      .where(and(eq(shops.id, id), eq(shops.verification_status, 'pending')))
      .returning({ id: shops.id, owner: shops.owner_user_id });
    if (!updated) notFound('shop');

    await writeAudit({
      adminUserId,
      action: 'verification_shop_rejected',
      entityType: 'shop',
      entityId: updated.id,
      oldValue: { verification_status: before.verification_status },
      newValue: { verification_status: 'rejected', reason },
      meta,
    });
    return { id: updated.id, user_id: updated.owner };
  }

  if (kind === 'fleet') {
    const [before] = await db
      .select({ status: fleets.status, verification_status: fleets.verification_status, owner: fleets.owner_user_id })
      .from(fleets)
      .where(eq(fleets.id, id))
      .limit(1);
    if (!before) notFound('fleet');
    if (before.verification_status !== 'pending') alreadyDecided('fleet');

    const [updated] = await db
      .update(fleets)
      .set({
        verification_status: 'rejected',
        verification_reason: reason,
        verification_reject: rejectPayload(details),
        verification_decided_at: new Date(),
        verification_decided_by: adminUserId,
        updated_at: new Date(),
      })
      .where(and(eq(fleets.id, id), eq(fleets.verification_status, 'pending')))
      .returning({ id: fleets.id, owner: fleets.owner_user_id });
    if (!updated) notFound('fleet');

    await writeAudit({
      adminUserId,
      action: 'verification_fleet_rejected',
      entityType: 'fleet',
      entityId: updated.id,
      oldValue: { verification_status: before.verification_status },
      newValue: { verification_status: 'rejected', reason },
      meta,
    });
    return { id: updated.id, user_id: updated.owner };
  }

  const [before] = await db
    .select({ status: couriers.status, verification_status: couriers.verification_status, owner: couriers.user_id })
    .from(couriers)
    .where(eq(couriers.id, id))
    .limit(1);
  if (!before) notFound('delivery_man');
  if (before.verification_status !== 'pending') alreadyDecided('delivery_man');

  const [updated] = await db
    .update(couriers)
    .set({
    verification_status: 'rejected',
    verification_reason: reason,
    verification_reject: rejectPayload(details),
    verification_decided_at: new Date(),
      verification_decided_by: adminUserId,
      updated_at: new Date(),
    })
    .where(and(eq(couriers.id, id), eq(couriers.verification_status, 'pending')))
    .returning({ id: couriers.id, owner: couriers.user_id });
  if (!updated) notFound('delivery_man');

  await writeAudit({
    adminUserId,
    action: 'verification_delivery_man_rejected',
    entityType: 'courier',
    entityId: updated.id,
    oldValue: { verification_status: before.verification_status },
    newValue: { verification_status: 'rejected', reason },
    meta,
  });
  return { id: updated.id, user_id: updated.owner };
}

/**
 * R6 re-submission: the applicant sends the record back into the queue after
 * fixing whatever the admin rejected. Scoped to the caller's OWN record, and
 * only from 'rejected' — there is no way to sneak a live role back into review.
 *
 * S2.1 M-5 (§16): the payload is the wizard's APPLICANT-EDITED fields (only
 * the kind's own object is applied, and only when provided) — the deep-linked
 * prefilled wizard is where fixes happen, so a resubmission carries the new
 * picture, not just a re-queue. The clear now covers BOTH reject columns:
 * `verification_reject` used to survive a resubmit, leaving every reader
 * (heldRoles reject surface, queue filters) the stale structured block.
 */
export async function resubmit(
  userId: string,
  kind: VerificationKind,
  updates?: RoleRecordPayload,
): Promise<{ status: 'pending'; resubmit_count: number }> {
  // C1-7: the read-check-increment is ONE transaction with a FOR UPDATE row
  // lock — two concurrent resubmits can no longer both read n=2 and both
  // write n=3 (the second blocks on the lock, then sees n=3 and 409s).
  if (kind === 'shop') {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: shops.id, n: shops.verification_resubmit_count })
        .from(shops)
        .where(and(eq(shops.owner_user_id, userId), eq(shops.verification_status, 'rejected'), isNull(shops.deleted_at)))
        .limit(1)
        .for('update');
      if (!row) throw Object.assign(new Error('No rejected shop to resubmit'), { status: 409 });
      if (row.n >= MAX_RESUBMITS)
        throw Object.assign(new Error('Resubmit limit reached — contact support'), { status: 409 });
      const s = updates?.shop;
      await tx
        .update(shops)
        .set({
          ...(s
            ? {
                name: s.shop_name,
                // slug is UNIQUE and derived per user — a renamed shop re-slices it.
                slug: shopSlug(s.shop_name, userId),
                shop_type_id: s.shop_type_id,
                address_line: s.address_line,
                license_url: s.license_url,
                ...(s.food_safety_cert_url ? { food_safety_cert_url: s.food_safety_cert_url } : {}),
              }
            : {}),
          verification_status: 'pending',
          verification_reason: null,
          verification_reject: null,
          verification_resubmit_count: row.n + 1,
          updated_at: new Date(),
        })
        .where(eq(shops.id, row.id));
      return { status: 'pending', resubmit_count: row.n + 1 } as const;
    });
  }

  if (kind === 'fleet') {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: fleets.id, n: fleets.verification_resubmit_count })
        .from(fleets)
        .where(and(eq(fleets.owner_user_id, userId), eq(fleets.verification_status, 'rejected')))
        .limit(1)
        .for('update');
      if (!row) throw Object.assign(new Error('No rejected fleet to resubmit'), { status: 409 });
      if (row.n >= MAX_RESUBMITS)
        throw Object.assign(new Error('Resubmit limit reached — contact support'), { status: 409 });
      const f = updates?.fleet;
      await tx
        .update(fleets)
        .set({
          ...(f
            ? {
                name: f.fleet_name,
                ...(f.business_name ? { business_name: f.business_name } : {}),
                ...(f.trade_license_number ? { trade_license_number: f.trade_license_number } : {}),
                trade_license_url: f.trade_license_url,
                ...(f.tax_doc_url ? { tax_doc_url: f.tax_doc_url } : {}),
              }
            : {}),
          verification_status: 'pending',
          verification_reason: null,
          verification_reject: null,
          verification_resubmit_count: row.n + 1,
          updated_at: new Date(),
        })
        .where(eq(fleets.id, row.id));
      return { status: 'pending', resubmit_count: row.n + 1 } as const;
    });
  }

  return db.transaction(async (tx) => {
    const [crow] = await tx
      .select({ id: couriers.id, n: couriers.verification_resubmit_count })
      .from(couriers)
      .where(and(eq(couriers.user_id, userId), eq(couriers.courier_type, 'food'), eq(couriers.verification_status, 'rejected')))
      .limit(1)
      .for('update');
    if (!crow) throw Object.assign(new Error('No rejected delivery-man record to resubmit'), { status: 409 });
    if (crow.n >= MAX_RESUBMITS)
      throw Object.assign(new Error('Resubmit limit reached — contact support'), { status: 409 });
    const d = updates?.delivery;
    await tx
      .update(couriers)
      .set({
        ...(d
          ? {
              nid_url: d.nid_url,
              license_url: d.license_url,
              ...(d.vehicle_note !== undefined ? { vehicle_note: d.vehicle_note } : {}),
            }
          : {}),
        verification_status: 'pending',
        verification_reason: null,
        verification_reject: null,
        verification_resubmit_count: crow.n + 1,
        updated_at: new Date(),
      })
      .where(eq(couriers.id, crow.id));
    return { status: 'pending', resubmit_count: crow.n + 1 } as const;
  });
}

/**
 * §7 A3: every decision lands in audit_logs with actor, entity and old/new.
 * The insert itself lives in lib/auditLog.ts (one writer for the whole admin
 * surface since S7); this adapter keeps the request-meta call shape the
 * S2 call sites already use.
 */
async function writeAudit(params: {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: Record<string, unknown>;
  newValue: Record<string, unknown>;
  meta: DecisionMeta;
}): Promise<void> {
  await writeSharedAudit({
    adminUserId: params.adminUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    oldValue: params.oldValue,
    newValue: params.newValue,
    ip: params.meta.ip,
    userAgent: params.meta.userAgent,
  });
}
