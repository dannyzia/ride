/**
 * Pure F35 branch resolver — extracted from withdraw handler for testability.
 * No DB imports; safe to require in unit tests.
 *
 * Given the request state and remaining active bid count, returns the next action.
 * - cnt > 0: more bids remain → null (no request transition)
 * - cnt === 0 + post-demotion (reselect_deadline_at set) → "no_bidders" (terminal)
 * - cnt === 0 + never awarded (reselect_deadline_at null, awarded_at null) → "broadcasting" (reopen)
 */
export function resolveF35Branch(
  req: { reselect_deadline_at: Date | null; awarded_at: Date | null },
  remainingActiveBids: number,
): "no_bidders" | "broadcasting" | null {
  if (remainingActiveBids > 0) return null;
  if (req.reselect_deadline_at) return "no_bidders";
  return "broadcasting";
}
