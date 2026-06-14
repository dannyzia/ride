// [public]
/**
 * Health check endpoint for the main API (ride-api).
 * Returns service status, timestamp, and basic system info.
 *
 * Usage: GET /api/health
 *
 * Response:
 * {
 *   "status": "ok",
 *   "timestamp": "2026-06-14T11:15:07.994Z",
 *   "service": "ride-api",
 *   "version": "1.0.4",
 *   "uptime_seconds": 12345
 * }
 */

const START_TIME = Date.now();

export async function GET(_request: Request) {
  const uptimeSeconds = Math.floor((Date.now() - START_TIME) / 1000);

  // Optional: check Supabase connection (quick, non-blocking)
  let dbStatus = "not_configured";
  let dbError: string | undefined;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Quick health check: try to get the auth config (doesn't hit the database)
      const { error } = await client.auth.getSession();
      if (!error) {
        dbStatus = "ok";
      } else {
        dbStatus = "error";
        dbError = error.message;
      }
    } catch (e: unknown) {
      dbStatus = "error";
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return Response.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "ride-api",
    version: process.env.npm_package_version || "1.0.4",
    uptime_seconds: uptimeSeconds,
    env: process.env.NODE_ENV || "development",
    database: {
      status: dbStatus,
      error: dbError,
    },
  });
}