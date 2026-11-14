/**
 * POST /api/telemetry/crash — first-party client crash ingest (Option B).
 *
 * Unauthenticated by design (clients crash before/during login), but
 * rate-limited per IP (max 30 requests/minute, in-memory). When a Bearer
 * token is present the caller's users.id is attached; any auth failure
 * degrades to userId = null instead of rejecting the report.
 *
 * WRITE OWNERSHIP: this route is the ONLY writer of client_crash_reports.
 */
import { z } from "zod";
import { db } from "@/src/db";
import { clientCrashReports } from "@/src/db/schema";
import { parseJsonBody } from "@/lib/parseBody";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { logger } from "@/lib/logger";

export const CrashReportSchema = z.object({
  platform: z.enum(["android", "ios", "web"]),
  app_version: z.string().min(1).max(32),
  error_message: z.string().min(1).max(2000),
  stack_trace: z.string().max(20000).optional(),
  component_stack: z.string().max(20000).optional(),
  is_fatal: z.boolean().default(false),
  device_id: z.string().max(128).optional(),
  extra_data: z.record(z.any()).optional(),
});

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const hitsByIp = new Map<string, number[]>();

export function resetCrashRateLimit(): void {
  hitsByIp.clear();
}

export function isCrashRateLimited(ip: string, now: number = Date.now()): boolean {
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (hits.length >= RATE_LIMIT_MAX) {
    hitsByIp.set(ip, hits);
    return true;
  }
  hits.push(now);
  hitsByIp.set(ip, hits);
  return false;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return "unknown";
}

async function resolveUserId(request: Request): Promise<string | null> {
  try {
    const header = request.headers.get("Authorization") ?? "";
    if (!header.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    if (!token) return null;
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    const { data: row } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("auth_uid", user.id)
      .maybeSingle();
    const id = (row as { id?: unknown } | null)?.id;
    return typeof id === "string" ? id : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (isCrashRateLimited(ip)) {
    return Response.json(
      { error: "rate_limited", message: "Too many crash reports" },
      { status: 429 },
    );
  }

  const result = await parseJsonBody(request, CrashReportSchema);
  if (!result.ok) return result.response;
  const body = result.data;

  const userId = await resolveUserId(request);

  try {
    const rows = await db
      .insert(clientCrashReports)
      .values({
        userId,
        deviceId: body.device_id ?? null,
        platform: body.platform,
        appVersion: body.app_version,
        errorMessage: body.error_message.slice(0, 1000),
        stackTrace: body.stack_trace?.slice(0, 10000) ?? null,
        componentStack: body.component_stack?.slice(0, 10000) ?? null,
        isFatal: body.is_fatal,
        extraData: body.extra_data ?? null,
      })
      .returning({ id: clientCrashReports.id });
    const id = (rows as { id?: unknown }[])[0]?.id ?? null;
    return Response.json({ success: true, id }, { status: 201 });
  } catch (err) {
    logger.error("[telemetry/crash] insert failed", err);
    return Response.json(
      { error: "internal_error", message: "An internal server error occurred" },
      { status: 500 },
    );
  }
}
