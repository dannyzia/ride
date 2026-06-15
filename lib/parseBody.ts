// Safe request body parser used at every API route boundary.
//
// Combines two defenses that `await request.json()` + `schema.safeParse()`
// alone do NOT provide:
//   1. Catches JSON parse failures (empty/truncated/malformed bodies) and
//      converts them into a clean 400 instead of bubbling up as a 500
//      "SyntaxError: Unexpected end of JSON input".
//   2. Validates the parsed value with Zod before any DB/service call.
//
// Usage:
//   const result = await parseJsonBody(request, createSchema);
//   if (!result.ok) return result.response;
//   // ... use result.data
import { z } from "zod";

export type ParseBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: Response };

/**
 * Reads and validates a JSON request body.
 * Returns `{ ok: false, response }` for the caller to return directly
 * when parsing or validation fails — never throws.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseBodyResult<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_json",
          message: "Request body is empty or not valid JSON",
        },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "validation_error", message: parsed.error.flatten() },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/**
 * Reads the request body as JSON without Zod validation.
 * Use this when the schema must be selected conditionally based on
 * body contents (e.g., discriminated payloads in `zones+api.ts`).
 * Prefer `parseJsonBody` whenever the schema is known up-front.
 */
export async function safeRequestJson(
  request: Request,
): Promise<{ ok: true; data: unknown } | { ok: false; response: Response }> {
  try {
    return { ok: true, data: await request.json() };
  } catch {
    return {
      ok: false,
      response: Response.json(
        {
          error: "invalid_json",
          message: "Request body is empty or not valid JSON",
        },
        { status: 400 },
      ),
    };
  }
}
