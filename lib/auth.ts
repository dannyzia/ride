import { supabaseAdmin } from './supabaseServer';
import type { User } from '@supabase/supabase-js';
import type { AdminRole } from './adminRoles';
export type { AdminRole } from './adminRoles';

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

export type AnyRole = 'rider' | 'driver' | AdminRole;

/**
 * Curried factory: requireAnyRole(roles) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 * Passes if dbUser.role is one of `roles`.
 *
 * Usage: await requireAnyRole(['admin', 'owner'])(request)
 */
export function requireAnyRole(roles: Array<'rider' | 'driver' | 'admin' | AdminRole>) {
  return async (request: Request): Promise<{ supabaseUser: User; dbUser: DbUser }> => {
    const supabaseUser = await resolveToken(request);

    const { data: dbUser } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('auth_uid', supabaseUser.id)
      .single();

    if (!dbUser || !roles.includes(dbUser.role as AnyRole)) {
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    return { supabaseUser, dbUser };
  };
}

/**
 * Curried factory: requireRole(role) returns a middleware function.
 * The middleware takes a Request and returns { supabaseUser, dbUser }.
 * Exact-match role check against users.role.
 *
 * Usage: await requireRole('admin')(request)
 *        const { user: admin } = await requireRole('admin')(request)
 */
export function requireRole(role: 'rider' | 'driver' | 'admin') {
  return requireAnyRole([role]);
}
