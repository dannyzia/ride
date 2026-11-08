/**
 * Batch-2 Item 3 — isOperatorPackageActive possession predicate (pure unit).
 *
 * Pins the exported helper: status='active' AND (expires_at IS NULL OR
 * expires_at > now()). An ENDED row is never active; an EXPIRED active row is
 * never active; NULL expires_at is unlimited. A future expiry is active.
 * Pure logic — no DB. Consumed by pool/state predicates in later Batch-2 items.
 * The _load-env import precedes the transitive @/src/db load (DATABASE_URL is
 * required at module init) — the standard repo pattern.
 */
import "../../scripts/_load-env";
import { isOperatorPackageActive } from "@/lib/monetizationMode";

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const hoursAhead = (h: number) => new Date(now + h * 3_600_000);

describe("isOperatorPackageActive — possession predicate (Batch-2 Item 3)", () => {
  const cases: Array<{
    label: string;
    status: string;
    expires_at: Date | string | null;
    want: boolean;
  }> = [
    {
      label: "active + NULL expiry (unlimited) → active",
      status: "active", expires_at: null, want: true,
    },
    {
      label: "active + future expiry → active",
      status: "active", expires_at: hoursAhead(24), want: true,
    },
    {
      label: "active + past expiry (D3-B-r2 expired) → NOT active",
      status: "active", expires_at: hoursAgo(1), want: false,
    },
    {
      label: "ended + NULL expiry → NOT active",
      status: "ended", expires_at: null, want: false,
    },
    {
      label: "ended + future expiry → NOT active",
      status: "ended", expires_at: hoursAhead(24), want: false,
    },
    {
      label: "ISO-string expiry is accepted",
      status: "active", expires_at: hoursAhead(24).toISOString(), want: true,
    },
    {
      label: "ended ISO-string expiry in the past → NOT active",
      status: "ended", expires_at: hoursAgo(24).toISOString(), want: false,
    },
  ];

  test.each(cases)("$label", ({ status, expires_at, want }) => {
    expect(isOperatorPackageActive({ status, expires_at })).toBe(want);
  });
});
