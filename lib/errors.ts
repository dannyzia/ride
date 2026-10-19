/**
 * Narrowing helpers for `catch (err: unknown)` blocks.
 *
 * The API layer throws a mix of shapes: plain objects `{ status, message }`
 * from auth/parseJsonBody helpers, Postgres errors `{ code: "23505" }` from
 * Drizzle, ZodError instances, and native Errors. These helpers recover those
 * fields without resorting to `any`, preserving the exact error-shape
 * handling the call sites already rely on.
 */

interface ErrorLike {
  status?: unknown;
  code?: unknown;
  name?: unknown;
  message?: unknown;
  issues?: unknown;
}

function asErrorLike(err: unknown): ErrorLike | null {
  if (err && typeof err === "object") return err as ErrorLike;
  return null;
}

/** Status code attached to thrown HTTP-style errors (e.g. `{ status: 401 }`). */
export function getErrorStatus(err: unknown): number | undefined {
  const status = asErrorLike(err)?.status;
  return typeof status === "number" ? status : undefined;
}

/** C2-1: map a guard-thrown account error to its HTTP body + status.
 * Returns null when the error carries no account machine code. */
export function authErrorBody(err: unknown): {
  status: number;
  body: { error: string; message: string; reason?: string | null };
} | null {
  const code = getErrorCode(err);
  const status = getErrorStatus(err);
  if (code === "account_suspended" && status === 403) {
    const reason =
      err && typeof err === "object" && "reason" in err
        ? ((err as { reason?: unknown }).reason as string | null)
        : null;
    return {
      status: 403,
      body: {
        error: "account_suspended",
        message: "Account suspended",
        reason: typeof reason === "string" ? reason : null,
      },
    };
  }
  if (code === "account_deleted" && status === 401) {
    return {
      status: 401,
      body: { error: "account_deleted", message: "Account deleted" },
    };
  }
  return null;
}

/** Postgres error code (e.g. "23505" unique violation). */
export function getErrorCode(err: unknown): string | undefined {
  const code = asErrorLike(err)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Error name (e.g. "ZodError"). */
export function getErrorName(err: unknown): string | undefined {
  const name = asErrorLike(err)?.name;
  return typeof name === "string" ? name : undefined;
}

/** Human-readable message, honoring `??`-style fallbacks at call sites. */
export function getErrorMessage(err: unknown, fallback = "An unexpected error occurred"): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  const message = asErrorLike(err)?.message;
  return typeof message === "string" ? message : fallback;
}

/** Zod validation issues (ZodError#issues). */
export function getErrorIssues(err: unknown): unknown[] | undefined {
  const issues = asErrorLike(err)?.issues;
  return Array.isArray(issues) ? issues : undefined;
}
