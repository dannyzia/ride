// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';
import { heldRoles } from '@/lib/launchRoles';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: 'missing_token', message: 'Authentication token missing' }, { status: 401 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return Response.json({ error: 'invalid_token', message: 'Invalid authentication token' }, { status: 401 });
  }

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id, role, phone, name, account_status, suspension_reason, deleted_at')
    .eq('auth_uid', user.id)
    .single();

  if (!dbUser) {
    // Registration race: SIGNED_IN may fire before the users row commits
    await new Promise(r => setTimeout(r, 500));
    const { data: retryUser } = await supabaseAdmin
      .from('users')
      .select('id, role, phone, name')
      .eq('auth_uid', user.id)
      .single();
    if (!retryUser) {
      return Response.json({ exists: false });
    }
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
    const held = await heldRoles(row.id);
    const active: string[] = held.filter((r) => r.status === 'active').map((r) => r.role);
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
      active_roles: active,
    });
  }
}
