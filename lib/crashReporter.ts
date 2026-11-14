/**
 * First-party crash reporter (Option B — ৳0, 0 third parties).
 *
 * Captures unhandled JS errors on native via ErrorUtils.setGlobalHandler and
 * on web via window error/unhandledrejection listeners, then POSTs a
 * truncated payload to the self-hosted POST /api/telemetry/crash route.
 *
 * Invariants (plan §4):
 * - Client-side throttling: max 5 reports per rolling 60s window.
 * - Safe truncation: error_message ≤ 1,000 chars, stack/component ≤ 10,000.
 * - Never throws: the reporter itself must not crash or loop the app.
 * - No third-party SDK imports.
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";

const MAX_REPORTS_PER_MINUTE = 5;
const WINDOW_MS = 60_000;
const ERROR_MESSAGE_LIMIT = 1000;
const STACK_LIMIT = 10000;

let initialized = false;
let reportTimestamps: number[] = [];
let endpointOverride: string | null = null;

export function setCrashReporterEndpoint(url: string | null): void {
  endpointOverride = url;
}

export function resetCrashReporterState(): void {
  initialized = false;
  reportTimestamps = [];
  endpointOverride = null;
}

function truncate(value: string | undefined, limit: number): string | undefined {
  if (value == null) return undefined;
  return value.length > limit ? value.slice(0, limit) : value;
}

function pruneWindow(now: number): void {
  reportTimestamps = reportTimestamps.filter((t) => now - t < WINDOW_MS);
}

/** Rolling-window gate: true when this report may be sent. */
export function shouldSendCrashReport(now: number = Date.now()): boolean {
  pruneWindow(now);
  if (reportTimestamps.length >= MAX_REPORTS_PER_MINUTE) return false;
  reportTimestamps.push(now);
  return true;
}

function resolveEndpoint(): string {
  return `${endpointOverride ?? API_URL}/api/telemetry/crash`;
}

function appVersion(): string {
  try {
    return String(Constants.expoConfig?.version ?? "unknown").slice(0, 32);
  } catch {
    return "unknown";
  }
}

async function postReport(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(resolveEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Fire-and-forget: a reporting failure must never surface to the user.
    logger.warn("[crashReporter] post failed", err);
  }
}

function buildPayload(args: {
  errorMessage: string;
  stackTrace?: string;
  componentStack?: string;
  isFatal?: boolean;
  extraData?: Record<string, unknown>;
}): Record<string, unknown> | null {
  if (!shouldSendCrashReport()) return null;
  const platform =
    Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  return {
    platform,
    app_version: appVersion(),
    error_message: truncate(args.errorMessage, ERROR_MESSAGE_LIMIT) ?? "unknown",
    ...(args.stackTrace ? { stack_trace: truncate(args.stackTrace, STACK_LIMIT) } : {}),
    ...(args.componentStack
      ? { component_stack: truncate(args.componentStack, STACK_LIMIT) }
      : {}),
    is_fatal: args.isFatal ?? false,
    extra_data: {
      ...(args.extraData ?? {}),
      platform_version: String(Platform.Version ?? "unknown").slice(0, 32),
    },
  };
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message || String(error);
  return String(error ?? "unknown error");
}

function toStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}

/**
 * Installs the global handlers once. Safe to call multiple times; subsequent
 * calls are no-ops. Preserves any previously installed ErrorUtils handler.
 */
export function initCrashReporter(): void {
  if (initialized) return;
  initialized = true;

  try {
    const g = global as unknown as {
      ErrorUtils?: { setGlobalHandler?: (h: (e: unknown, isFatal?: boolean) => void) => void; getGlobalHandler?: () => (e: unknown, isFatal?: boolean) => void };
    };
    const previous = g.ErrorUtils?.getGlobalHandler?.();
    g.ErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
      try {
        const payload = buildPayload({
          errorMessage: toMessage(error),
          stackTrace: toStack(error),
          isFatal: isFatal ?? false,
        });
        if (payload) void postReport(payload);
      } catch {
        // Swallow — the reporter must never throw.
      } finally {
        try {
          previous?.(error, isFatal);
        } catch {
          // Previous handler failures must not propagate either.
        }
      }
    });
  } catch {
    // ErrorUtils unavailable (e.g. web) — web listeners below still apply.
  }

  try {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("error", (event: ErrorEvent) => {
        try {
          const payload = buildPayload({
            errorMessage: toMessage((event as ErrorEvent).error ?? (event as ErrorEvent).message),
            stackTrace: toStack((event as ErrorEvent).error),
            isFatal: false,
            extraData: { source: "window.onerror" },
          });
          if (payload) void postReport(payload);
        } catch {
          // Swallow.
        }
      });
      window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
        try {
          const payload = buildPayload({
            errorMessage: toMessage((event as PromiseRejectionEvent).reason),
            stackTrace: toStack((event as PromiseRejectionEvent).reason),
            isFatal: false,
            extraData: { source: "unhandledrejection" },
          });
          if (payload) void postReport(payload);
        } catch {
          // Swallow.
        }
      });
    }
  } catch {
    // Listener install must never throw.
  }
}
