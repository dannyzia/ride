// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { heldRoles } from '@/lib/launchRoles';
import { isRideVerticalEnabled } from '@/lib/platformConfig';
import { logger } from '@/lib/logger';

export async function POST(request: Request) {
  logger.info('[verify-token] POST received');
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    logger.info('[verify-token] missing token');
    return Response.json({ error: 'missing_token', message: 'Authentication token missing' }, { status: 401 });
  }

  logger.info('[verify-token] calling supabaseAdmin.auth.getUser');
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  logger.info('[verify-token] getUser result', { hasUser: !!user, error: error?.message });
  if (error || !user) {
    return Response.json({ error: 'invalid_token', message: 'Invalid authentication token' }, { status: 401 });
  }

  logger.info('[verify-token] querying dbUser for auth_uid', { authUid: user.id });
  const { data: dbUser, error: dbError } = await supabaseAdmin
    .from('users')
    .select('id, role, phone, name, account_status, suspension_reason, deleted_at')
    .eq('auth_uid', user.id)
    .single();
  logger.info('[verify-token] dbUser query done', { hasDbUser: !!dbUser, error: dbError?.message });

  if (!dbUser) {
    logger.info('[verify-token] no dbUser found, retrying...');
    // Registration race: SIGNED_IN may fire before the users row commits
    await new Promise(r => setTimeout(r, 500));
    const { data: retryUser } = await supabaseAdmin
      .from('users')
      .select('id, role, phone, name')
      .eq('auth_uid', user.id)
      .single();
    if (!retryUser) {
      logger.info('[verify-token] retryUser not found, returning exists: false');
      return Response.json({ exists: false });
    }
    logger.info('[verify-token] retryUser found, calling respond');
    return respond(retryUser);
  }

  // C2-1: suspension/deletion gate (shared chain: resolveToken → here).
  if ((dbUser as { deleted_at?: string | null }).deleted_at != null) {
    return Response.json({ error: 'account_deleted', message: 'Account deleted' }, { status: 401 });
  }
  if ((dbUser as { account_status?: string | null }).account_status === 'suspended') {
    return Response.json({
      error: 'account_suspended',
      message: 'Account suspended',
      reason: (dbUser as { suspension_reason?: string | null }).suspension_reason ?? null,
    }, { status: 403 });
  }
  if (dbUser.role === 'driver') {
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('status')
      .eq('user_id', dbUser.id)
      .maybeSingle();
    const st = (driver as { status?: string } | null)?.status;
    if (st === 'suspended' || st === 'rejected') {
      return Response.json({
        error: 'account_suspended',
        message: 'Account suspended',
        reason: (dbUser as { suspension_reason?: string | null }).suspension_reason ?? `driver_${st}`,
      }, { status: 403 });
    }
  }

  return respond(dbUser);

  // S2.1 D-1 (§16): the auth gate routes on the ACTIVE role set (OWNER-DECISION
  // #9) — a single-role account lands in its surface directly, an account with
  // MORE THAN ONE active role hits the Login-as chooser. The projection is
  // ACTIVE-only on purpose: gating on pending/rejected roles would bounce a
  // fully-unverified multi-holder straight into the chooser forever.
  async function respond(row: { id: string; role: string; phone: string | null; name: string | null }) {
    logger.info('[verify-token] respond called for user', { id: row.id, role: row.role });
    // ROLE RESOLUTION FAILS OPEN, NEVER CLOSED.
    //
    // This used to race heldRoles() against a 2.5s timer and, on timeout, fall
    // back to `[row.role]` — the PRIMARY role only. That answer is not "slow",
    // it is WRONG: it tells the client "single-role account", so the auth gate
    // (app/_layout.tsx) skips the Login-as chooser and drops the user into one
    // surface. For a fleet_owner who also drives, that made the fleet portal
    // STRUCTURALLY unreachable on device (measured 2026-11-10: the chooser was
    // skipped after a successful login and enterFleet() never ran). 2.5s is
    // well inside a cold serverless invocation's 6 sequential queries, so the
    // wrong branch was a coin flip on real hardware, not an edge case.
    //
    // Now: one bounded, longer attempt; if it still fails, say so explicitly
    // with `roles_unknown: true` and NO fasified role list. The gate sends
    // those accounts to the chooser, which re-reads /api/user/roles itself and
    // shows the truth (a genuinely single-role account simply sees one row).
    // `role` stays for legacy clients that never read active_roles.
    const ROLES_BUDGET_MS = 10_000;
    let held: { role: string; status: string }[] | null = null;
    // The timer is cleared in `finally`: left armed it keeps the isolate alive
    // for the rest of the budget after a fast success (measured: jest reported
    // "did not exit one second after the test run" with the uncleared version).
    let budgetTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      held = await Promise.race([
        heldRoles(row.id),
        new Promise<never>((_, reject) => {
          budgetTimer = setTimeout(
            () => reject(new Error('heldRoles timeout')),
            ROLES_BUDGET_MS,
          );
        }),
      ]);
      logger.info('[verify-token] heldRoles result', { count: held?.length ?? 0 });
    } catch (err: any) {
      logger.warn('[verify-token] heldRoles unresolved — reporting roles_unknown (never a single-role guess)', {
        message: err?.message,
        budget_ms: ROLES_BUDGET_MS,
      });
    } finally {
      if (budgetTimer) clearTimeout(budgetTimer);
    }
    const roles_unknown = held === null;
    const active: string[] = (held ?? [])
      .filter((r) => r.status === 'active')
      .map((r) => r.role);
    // Only a RESOLVED, genuinely empty answer falls back to the primary role.
    if (!roles_unknown && active.length === 0 && row.role) {
      active.push(row.role);
    }
    // Staff lane (Flow 15): an active shop_members row surfaces the shop
    // surface in the chooser as a synthetic `shop_staff` entry — invited
    // staff hold no user_roles row of their own. Fail-closed: a probe
    // failure only hides the row, it never fails the login.
    try {
      const { data: staff } = await supabaseAdmin
        .from('shop_members')
        .select('id')
        .eq('user_id', row.id)
        .is('removed_at', null)
        .limit(1)
        .maybeSingle();
      if (staff) active.push('shop_staff');
    } catch {
      // Probe failed — the account still logs in, minus the staff row.
    }
    return Response.json({
      exists: true,
      user_id: row.id,
      role: row.role,
      phone: row.phone,
      name: row.name,
      // null = "not resolved", never an empty list: the gate must be able to
      // tell "one role" apart from "we do not know yet".
      active_roles: roles_unknown ? null : active,
      roles_unknown,
      // Node launch (DESIGN-NODE-LAUNCH.md Component A): additive boot flags
      // for the authenticated splash path. Backward compatible — existing
      // consumers ignore the field. Fresh read, fail-closed
      // (isVerticalEnabled: missing key / DB error ⇒ ride hidden).
      flags: { ride_vertical_enabled: await isRideVerticalEnabled() },
    });
  }
}
