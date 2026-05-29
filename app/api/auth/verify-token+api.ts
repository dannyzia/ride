// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 401 });
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return Response.json({ error: 'invalid_token' }, { status: 401 });
  }

  const { data: dbUser } = await supabaseAdmin
    .from('users')
    .select('id, role, phone')
    .eq('auth_uid', user.id)
    .single();

  if (!dbUser) {
    return Response.json({ exists: false });
  }

  return Response.json({
    exists: true,
    user_id: dbUser.id,
    role: dbUser.role,
    phone: dbUser.phone,
  });
}
