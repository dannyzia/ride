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
    .select('id, role, phone, name')
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

  return respond(dbUser);

  // S2.1 D-1 (§16): the auth gate routes on the ACTIVE role set (OWNER-DECISION
  // #9) — a single-role account lands in its surface directly, an account with
  // MORE THAN ONE active role hits the Login-as chooser. The projection is
  // ACTIVE-only on purpose: gating on pending/rejected roles would bounce a
  // fully-unverified multi-holder straight into the chooser forever.
  async function respond(row: { id: string; role: string; phone: string | null; name: string | null }) {
    const held = await heldRoles(row.id);
    return Response.json({
      exists: true,
      user_id: row.id,
      role: row.role,
      phone: row.phone,
      name: row.name,
      active_roles: held.filter((r) => r.status === 'active').map((r) => r.role),
    });
  }
}
