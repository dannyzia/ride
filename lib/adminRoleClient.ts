// Shared client helper: fetch the current admin's DB role via the server.
// Replaces the anon-key `users` self-lookups that RLS default-deny made dead
// (T6 audit: components/admin/AdminShell.tsx, app/admin/fare-config.tsx,
// app/admin/_layout.tsx) — the role now comes from POST /api/auth/verify-token,
// which resolves server-side over the Drizzle/owner path.
//
// End-state goal (ISSUE-81): zero RLS policies in public; this helper is what
// makes dropping users_self_read safe.
import { adminFetch } from "@/lib/adminFetch";
import { logger } from "@/lib/logger";
import type { AdminRole } from "@/lib/adminRoles";

/**
 * Resolve the signed-in admin's role from the server. Returns null when the
 * session is missing, the user has no DB row, or the API is unreachable —
 * callers treat null as "not an admin / not determinable" and show their own
 * error state. Never throws.
 */
export async function fetchAdminRole(): Promise<AdminRole | null> {
  const { data, error } = await adminFetch<{
    exists: boolean;
    role?: string;
  }>("/api/auth/verify-token", { method: "POST" });

  if (error || !data?.exists || typeof data.role !== "string") {
    if (error) {
      logger.warn("[adminRoleClient] verify-token failed", { error });
    }
    return null;
  }

  return data.role as AdminRole;
}
