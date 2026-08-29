/**
 * Admin role constants and types — zero dependencies.
 *
 * This file exists so client-side code (admin layout, admin UI) can import
 * ADMIN_ROLES and AdminRole without pulling in lib/auth.ts → lib/supabaseServer.ts → ws.
 *
 * Server-side modules (auth.ts, adminRbac.ts) re-export or import from here
 * for a single source of truth.
 */

/** The 4-role admin family (owner ruling REV-4). Owner is the superuser. */
export type AdminRole = 'owner' | 'admin' | 'ops_manager' | 'moderator';

/** All members of the admin family. */
export const ADMIN_ROLES: AdminRole[] = ['owner', 'admin', 'ops_manager', 'moderator'];
