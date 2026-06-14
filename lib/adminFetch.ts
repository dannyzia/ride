// Thin fetch wrapper for admin API routes.
// Adds Authorization header from Supabase session, JSON content-type,
// and normalizes errors into a stable shape.
//
// Usage:
//   const { data, error, status } = await adminFetch('/api/admin/queue', { method: 'GET' });
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export interface AdminFetchResult<T = unknown> {
  data: T | null;
  error: string | null;
  message?: string;
  status: number;
}

/**
 * Fetch wrapper that auto-attaches the current admin's Supabase JWT.
 * Returns a normalized { data, error, status } object. Never throws.
 */
export async function adminFetch<T = unknown>(
  input: string,
  init: RequestInit = {},
): Promise<AdminFetchResult<T>> {
  try {
    const { data: session } = await supabase!.auth.getSession();
    const token = session?.session?.access_token;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(input, { ...init, headers });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        data: null,
        error: (body && (body.error || body.code)) || "request_failed",
        message: body?.message,
        status: res.status,
      };
    }

    return { data: body as T, error: null, status: res.status };
  } catch (err) {
    logger.error("[adminFetch] network error", { input, err });
    return {
      data: null,
      error: "network_error",
      status: 0,
    };
  }
}
