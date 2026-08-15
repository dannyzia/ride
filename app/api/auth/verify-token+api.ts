// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';

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
    return Response.json({
      exists: true,
      user_id: retryUser.id,
      role: retryUser.role,
      phone: retryUser.phone,
      name: retryUser.name,
    });
  }

  return Response.json({
    exists: true,
    user_id: dbUser.id,
    role: dbUser.role,
    phone: dbUser.phone,
    name: dbUser.name,
  });
}
