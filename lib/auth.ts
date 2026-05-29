import { supabaseAdmin } from './supabaseServer';
import type { User } from '@supabase/supabase-js';

async function resolveToken(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw Object.assign(new Error('Unauthorized'), { status: 401 });

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return user;
}

/**
 * Verifies the Supabase JWT from the Authorization header.
 * Returns the Supabase Auth User object.
 */
export async function verifyAuth(request: Request) {
  return resolveToken(request);
}

/** Alias used by checklist verification — same as verifyAuth. */
export const verifySupabaseToken = verifyAuth;

type DbUser = { id: string; role: string };

/**
 * Curried factory: requireRole(role) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 *
 * Usage: await requireRole('admin')(request)
 *        const { user: admin } = await requireRole('admin')(request)
 */
export function requireRole(role: 'rider' | 'driver' | 'admin') {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: DbUser }> => {
    const supabaseUser = await resolveToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .single();

    if (!dbUser || dbUser.role !== role) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return { supabaseUser, dbUser };
  };
}
