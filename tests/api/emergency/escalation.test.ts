// @ts-nocheck — Jest mock factories produce untyped DB chains; runtime
// behavior is what's under test (Phase 3 precedent).
/**
 * B4-2 — F-19 escalation pins (skeptic §B4, orchestrator-ruled).
 *
 * escalateUnacknowledgedEmergencies must, behaviorally:
 *  1. claim-once — two escalator ticks escalate a row exactly once (the
 *     conditional UPDATE stamps escalated_at; the second tick claims nothing);
 *  2. widened ring — the re-broadcast query receives the ESCALATION ring
 *     (emergency_escalation_k_ring, seed 50), never the base 25;
 *  3. delay notice — the requester notice carries idempotency key
 *     emergency_escalated:{id} (M5 dedupe);
 *  4. tick order — job 53 escalates BEFORE the TTL sweep fails the row.
 * Plus a fault-injection pair: a store that defeats the claim guard
 * double-processes, proving the claim-once pin is sensitive (it flips).
 */
import { jest } from "@jest/globals";
import { readFileSync } from "fs";
import { join } from "path";
import { escalateUnacknowledgedEmergencies } from "@/utils-server/emergencyChain";

const ACK_SECONDS = 60;
const WIDENED_RING = 50;

jest.mock("@/lib/platformConfig", () => ({
  getConfigInt: jest.fn(async (key: string, fallback: number) => {
    if (key === "emergency_ack_timeout_seconds") return ACK_SECONDS;
    if (key === "emergency_escalation_k_ring") return WIDENED_RING;
    return fallback;
  }),
}));

const mockEligible = jest.fn(async () => ["driver-1"]);
jest.mock("@/lib/ambulanceCerts", () => ({
  getEligibleEmergencyDriverUserIds: (...a: unknown[]) => mockEligible(...a),
}));

jest.mock("@/utils-server/emergencyBus", () => ({
  emergencySendToUser: jest.fn(),
}));

jest.mock("@/lib/notify", () => ({
  sendNotifications: jest.fn(async () => undefined),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// emergencyChain binds `db` only as the default tx (every test below passes
// an explicit claim-tx), so a dummy binding keeps src/db/index.ts — which
// throws without DATABASE_URL — out of the import graph entirely.
jest.mock("@/src/db", () => ({ db: {} }));

// ── Faithful claim store ─────────────────────────────────────────────
// Emulates Postgres conditional-UPDATE semantics: the claim stamps ONLY
// rows with escalated_at IS NULL (plus the status/age predicates the real
// WHERE carries). A store that skips the null check = the fault-injected
// copy used by the sensitivity test below.
function makeClaimTx(store: Record<string, any>, opts?: { ignoreNullGuard?: boolean }) {
  return {
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            const claimed: any[] = [];
            for (const row of Object.values(store)) {
              const oldEnough =
                new Date(row.created_at).getTime() < Date.now() - ACK_SECONDS * 1000;
              const unclaimed = opts?.ignoreNullGuard ? true : row.escalated_at == null;
              if (row.status === "broadcasting" && unclaimed && oldEnough) {
                row.escalated_at = new Date();
                row.updated_at = new Date();
                claimed.push({ ...row });
              }
            }
            return claimed;
          },
        }),
      }),
    }),
  };
}

function seedRow(overrides: Record<string, any> = {}) {
  return {
    id: "req-1",
    status: "broadcasting",
    caller_user_id: "caller-1",
    pickup_address: "12 Lake Road",
    pickup_lat: "23.780",
    pickup_lng: "90.400",
    service_level: "basic",
    requires_paramedic: false,
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(Date.now() - 120_000),
    escalated_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockEligible.mockClear();
  mockEligible.mockResolvedValue(["driver-1"]);
});

describe("B4-2 — F-19 escalation behavioral pins", () => {
  it("claim-once: two escalator ticks escalate the row exactly once", async () => {
    const store = { "req-1": seedRow() };
    const queue: any[] = [];
    const first = await escalateUnacknowledgedEmergencies(makeClaimTx(store), queue);
    const second = await escalateUnacknowledgedEmergencies(makeClaimTx(store), queue);
    expect(first).toBe(1);
    expect(second).toBe(0);
    // Exactly one requester delay notice for the row, ever.
    expect(queue.filter((n) => n.idempotencyKey === "emergency_escalated:req-1")).toHaveLength(1);
  });

  it("the re-broadcast query receives the widened escalation ring", async () => {
    const store = { "req-1": seedRow() };
    await escalateUnacknowledgedEmergencies(makeClaimTx(store), []);
    expect(mockEligible).toHaveBeenCalledTimes(1);
    const ringArg = mockEligible.mock.calls[0][3];
    expect(ringArg).toBe(WIDENED_RING);
    expect(ringArg).not.toBe(25);
  });

  it("the delay notice carries its idempotency key and reaches the caller", async () => {
    const store = { "req-1": seedRow() };
    const queue: any[] = [];
    await escalateUnacknowledgedEmergencies(makeClaimTx(store), queue);
    const notice = queue.find((n) => n.idempotencyKey === "emergency_escalated:req-1");
    expect(notice).toBeDefined();
    expect(notice.userId).toBe("caller-1");
    // The widened-ring alarm itself keeps the M5 deterministic key (dedupe
    // against the base-ring broadcast the driver already saw).
    const alarm = queue.find(
      (n) => n.idempotencyKey === "emergency_activation:req-1:driver-1",
    );
    expect(alarm).toBeDefined();
  });

  it("fault-injection: defeating the claim guard double-processes (pin is sensitive)", async () => {
    // The sabotaged store returns the row on EVERY tick, as if the
    // isNull(escalated_at) predicate had been deleted from the claim.
    const store = { "req-1": seedRow() };
    const queue: any[] = [];
    await escalateUnacknowledgedEmergencies(makeClaimTx(store, { ignoreNullGuard: true }), queue);
    await escalateUnacknowledgedEmergencies(makeClaimTx(store, { ignoreNullGuard: true }), queue);
    // Without the guard the row escalates twice — the claim-once pin above
    // (exactly one notice) FLIPS here, which is what makes it a real pin.
    expect(queue.filter((n) => n.idempotencyKey === "emergency_escalated:req-1")).toHaveLength(2);
  });

  it("job 53 escalates before the TTL sweep fails the row (tick order)", async () => {
    const src = readFileSync(join(__dirname, "..", "..", "..", "utils-server", "scheduler.ts"), "utf8");
    const esc = src.indexOf("escalateUnacknowledgedEmergencies(tx, notifyQueue)");
    const sweep = src.indexOf("(tx) => sweepExpiredEmergencies(tx)");
    expect(esc).toBeGreaterThan(-1);
    expect(sweep).toBeGreaterThan(-1);
    expect(esc).toBeLessThan(sweep);
  });
});

