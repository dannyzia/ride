/**
 * Shared helper for fleet screens to get the Supabase auth token.
 * Returns the Authorization header object, or null if not authenticated.
 */
import { supabase } from "@/lib/supabase";

export async function getAuthHeaders(): Promise<
  Record<string, string> | null
> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Convenience: returns headers or throws if unauthenticated.
 * Use in screens where auth is required before rendering.
 */
export async function requireAuthHeaders(): Promise<Record<string, string>> {
  const headers = await getAuthHeaders();
  if (!headers) throw new Error("Not authenticated");
  return headers;
}
