// [public]
import { supabaseAdmin } from '../../../lib/supabaseServer';

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: 'missing_token' }, { status: 401 });
  }

  const { error } = await supabaseAdmin.auth.admin.signOut(token);
  if (error) {
    return Response.json({ error: 'logout_failed' }, { status: 500 });
  }

  return Response.json({ ok: true });
}
