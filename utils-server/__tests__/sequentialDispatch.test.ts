/**
 * Sequential dispatch chain invariants (Phase D — AGENTS.md new invariant set).
 * Tests the chain state machine in utils-server/dispatchChain.ts directly:
 * index.ts starts a real HTTP/WS server at import time and cannot run under
 * jest, so the pipeline loop is dependency-injected and exercised here with
 * fakes. Pool-level invariants (3) calls_remaining=0 and (4) daily-cap
 * drivers never in the candidate pool are covered by
 * dispatch-min-per-km.test.ts (buildCandidateList).
 *
 * Invariant map:
 *  (1) exactly one outstanding offer per ride at a time       — below
 *  (2) one deduction row per (ride_id, driver_id)              — leadBilling.test.ts
 *  (3) calls_remaining=0 never in pool                         — dispatch-min-per-km.test.ts
 *  (4) daily-cap-exceeded never in pool                        — dispatch-min-per-km.test.ts
 *  (5) no driver offered the same ride twice                   — below
 *  (6) every offered driver was billed (debit precedes offer)  — below
 *  (7) declined/expired offer → next candidate offered         — below
 *  (8) rider cancel mid-chain → abort, no further offers       — below
 *  (9) re-dispatch → previously billed drivers not re-billed   — mechanism below
 *      (registerChain duplicate guard) + DB-level chain-exclusion and
 *      leadBilling conflict tests
 *  (10) billing atomicity                                      — leadBilling.test.ts
 */
import {
  runSequentialChain,
  awaitOfferSettlement,
  resolvePendingOffer,
  resolvePendingOfferForDriver,
  abortChain,
  hasPendingOffer,
  pendingOfferDriverId,
  registerChain,
  type OfferOutcome,
  type RunChainDeps,
  type ChainCandidate,
} from "../dispatchChain";

interface CallLogEntry {
  op: string;
  driverId: string;
}

interface ChainHarness {
  events: string[];
  calls: CallLogEntry[];
  connected: Set<string>;
  dispatching: boolean;
  billed: Map<string, boolean>;
  balances: Map<string, number>;
  autoAcceptMatch: Map<string, boolean>;
  settled: { driverId: string; outcome: OfferOutcome }[];
  endReasons: string[];
  offeredDrivers: string[];
  outcomes: Map<string, OfferOutcome>;
}

function makeDeps(overrides: Partial<ChainHarness> = {}): { deps: RunChainDeps; h: ChainHarness } {
  const h: ChainHarness = {
    events: [],
    calls: [],
    connected: new Set(),
    dispatching: true,
    billed: new Map(),
    balances: new Map(),
    autoAcceptMatch: new Map(),
    settled: [],
    endReasons: [],
    offeredDrivers: [],
    outcomes: new Map(),
    ...overrides,
  };

  const deps: RunChainDeps = {
    isDriverConnected: (driverId) => h.connected.has(driverId),
    isRideDispatching: async () => h.dispatching,
    debitLead: async (driverId) => {
      h.calls.push({ op: "debit", driverId });
      const billed = h.billed.get(driverId) ?? true;
      return { billed, balanceAfter: billed ? 9 : null };
    },
    emitLeadBilled: (driverId, balanceAfter) => {
      h.calls.push({ op: "lead-billed", driverId });
      h.balances.set(driverId, balanceAfter);
    },
    runAutoAccept: async (driverId) => {
      h.calls.push({ op: "auto-accept", driverId });
      const matched = h.autoAcceptMatch.get(driverId) ?? true;
      if (!matched) {
        // Race lost: the real match flow's zero-row update means the ride is
        // no longer dispatching — mirror that so the next status check ends
        // the chain.
        h.dispatching = false;
      }
      return matched;
    },
    sendOffer: (driverId) => {
      h.calls.push({ op: "offer", driverId });
      h.offeredDrivers.push(driverId);
      // The real dep awaits settlement via awaitOfferSettlement; tests
      // resolve it programmatically through the registry.
      return awaitOfferSettlement("ride-1", driverId, 15_000, () => {
        h.events.push(`offer-lost-expired:${driverId}`);
      }).then((outcome) => {
        h.outcomes.set(driverId, outcome);
        return outcome;
      });
    },
    onSettled: (driverId, outcome) => {
      h.settled.push({ driverId, outcome });
    },
    onChainEnd: (reason) => {
      h.endReasons.push(reason);
    },
  };
  return { deps, h };
}

function candidates(...ids: string[]): ChainCandidate[] {
  return ids.map((driverId) => ({ driverId, auto_accept_eligible: false }));
}

/** Let the chain's awaits run so the pending offer is registered before resolving. */
async function flush(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("invariant (1) — exactly one outstanding offer per ride at a time", () => {
  test("offers never overlap: driver 2 is offered only after driver 1 settles", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);

    // d1's offer is outstanding — d2 must NOT be offered yet
    await jest.advanceTimersByTimeAsync(5_000);
    expect(h.offeredDrivers).toEqual(["d1"]);
    expect(hasPendingOffer("ride-1")).toBe(true);
    expect(pendingOfferDriverId("ride-1")).toBe("d1");

    resolvePendingOffer("ride-1", "d1", "rejected");
    await jest.advanceTimersByTimeAsync(0);
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);

    resolvePendingOffer("ride-1", "d2", "accepted");
    await expect(chain).resolves.toBe("matched");
  });

  test("a second chain for the same ride is rejected (single-pipeline backstop)", async () => {
    const { deps } = makeDeps({ connected: new Set(["d1"]) });
    const chain = runSequentialChain("ride-1", candidates("d1"), deps);
    await jest.advanceTimersByTimeAsync(0);

    const { deps: deps2 } = makeDeps();
    await expect(runSequentialChain("ride-1", candidates("d2"), deps2)).resolves.toBe("duplicate");

    resolvePendingOffer("ride-1", "d1", "expired");
    await expect(chain).resolves.toBe("exhausted");
  });
});

describe("invariant (5) — no driver offered the same ride twice", () => {
  test("duplicate candidate ids are deduped by the chain", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["a", "b"]) });
    const chain = runSequentialChain("ride-1", candidates("a", "a", "b", "a"), deps);
    await flush();

    resolvePendingOffer("ride-1", "a", "rejected");
    await jest.advanceTimersByTimeAsync(0);
    resolvePendingOffer("ride-1", "b", "rejected");
    await expect(chain).resolves.toBe("exhausted");
    expect(h.offeredDrivers).toEqual(["a", "b"]);
  });
});

describe("invariant (6) — every offered driver is billed first (debit-on-offer)", () => {
  test("debit + lead:billed precede every offer, for reject/expire/auto-accept alike", async () => {
    const pool: ChainCandidate[] = [
      { driverId: "rejector", auto_accept_eligible: false },
      { driverId: "expirer", auto_accept_eligible: false },
      { driverId: "auto", auto_accept_eligible: true },
    ];
    const { deps, h } = makeDeps({
      connected: new Set(["rejector", "expirer", "auto"]),
      autoAcceptMatch: new Map([["auto", true]]),
    });
    const chain = runSequentialChain("ride-1", pool, deps);
    await flush();

    resolvePendingOffer("ride-1", "rejector", "rejected");
    await jest.advanceTimersByTimeAsync(0);
    // expirer never responds — TTL fires
    await jest.advanceTimersByTimeAsync(20_000);
    await expect(chain).resolves.toBe("matched");

    // Each offered driver: debit → lead-billed → (offer | auto-accept)
    const seq = h.calls.map((c) => `${c.op}:${c.driverId}`);
    expect(seq).toEqual([
      "debit:rejector", "lead-billed:rejector", "offer:rejector",
      "debit:expirer", "lead-billed:expirer", "offer:expirer",
      "debit:auto", "lead-billed:auto", "auto-accept:auto",
    ]);
  });

  test("unbilled driver (billed=false) is skipped — no offer, no lead:billed", async () => {
    const { deps, h } = makeDeps({
      connected: new Set(["no-balance", "ok"]),
      billed: new Map([["no-balance", false], ["ok", true]]),
    });
    const chain = runSequentialChain("ride-1", candidates("no-balance", "ok"), deps);
    await flush();

    resolvePendingOffer("ride-1", "ok", "accepted");
    await expect(chain).resolves.toBe("matched");

    expect(h.offeredDrivers).toEqual(["ok"]);
    expect(h.calls.find((c) => c.op === "lead-billed" && c.driverId === "no-balance")).toBeUndefined();
  });
});

describe("invariant (7) — declined/expired offer → next candidate offered", () => {
  test("rejected → next offered", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);
    await flush();

    resolvePendingOffer("ride-1", "d1", "rejected");
    await jest.advanceTimersByTimeAsync(0);
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);
    expect(h.settled).toContainEqual({ driverId: "d1", outcome: "rejected" });

    resolvePendingOffer("ride-1", "d2", "accepted");
    await expect(chain).resolves.toBe("matched");
  });

  test("TTL expiry → offer:lost hook fires, offer expires, next candidate offered", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);

    await jest.advanceTimersByTimeAsync(16_000);
    expect(h.events).toContain("offer-lost-expired:d1");
    expect(h.outcomes.get("d1")).toBe("expired");
    expect(h.settled).toContainEqual({ driverId: "d1", outcome: "expired" });
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);

    resolvePendingOffer("ride-1", "d2", "accepted");
    await expect(chain).resolves.toBe("matched");
  });

  test("driver socket close → immediate resolution (no dead TTL wait), next offered", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);

    await jest.advanceTimersByTimeAsync(1_000);
    resolvePendingOfferForDriver("d1", "disconnected");
    await jest.advanceTimersByTimeAsync(0);

    expect(h.outcomes.get("d1")).toBe("disconnected");
    expect(h.settled).toContainEqual({ driverId: "d1", outcome: "disconnected" });
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);

    resolvePendingOffer("ride-1", "d2", "accepted");
    await expect(chain).resolves.toBe("matched");
  });
});

describe("invariant (8) — rider cancel mid-chain → abort, no further offers, no refunds", () => {
  test("abortChain resolves the pending offer as cancelled and stops the chain", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2", "d3"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2", "d3"), deps);

    await jest.advanceTimersByTimeAsync(0);
    expect(h.offeredDrivers).toEqual(["d1"]);

    const pending = abortChain("ride-1");
    expect(pending).toEqual({ driverId: "d1" });
    await flush();
    expect(h.outcomes.get("d1")).toBe("cancelled");
    expect(h.settled).toContainEqual({ driverId: "d1", outcome: "cancelled" });

    await expect(chain).resolves.toBe("aborted");
    // No further offers after the cancel
    expect(h.offeredDrivers).toEqual(["d1"]);
    // handleNoDrivers is NOT invoked for an aborted chain
    expect(h.endReasons).toEqual(["aborted"]);
    // The TTL timer was cleared — advancing time must not resurrect anything
    await jest.advanceTimersByTimeAsync(60_000);
    expect(h.events).not.toContain("offer-lost-expired:d1");
  });

  test("abort with no outstanding offer stops before the next candidate", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);
    await flush();
    resolvePendingOffer("ride-1", "d1", "rejected");
    await jest.advanceTimersByTimeAsync(0);
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);

    // d2 has the outstanding offer — abort resolves it as cancelled
    abortChain("ride-1");
    await expect(chain).resolves.toBe("aborted");
    expect(h.offeredDrivers).toEqual(["d1", "d2"]);
    expect(h.outcomes.get("d2")).toBe("cancelled");
  });
});

describe("chain termination paths", () => {
  test("pool exhausted → onChainEnd('exhausted') (handleNoDrivers flow)", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1"]) });
    const chain = runSequentialChain("ride-1", candidates("d1"), deps);
    await flush();
    resolvePendingOffer("ride-1", "d1", "rejected");
    await expect(chain).resolves.toBe("exhausted");
    expect(h.endReasons).toEqual(["exhausted"]);
  });

  test("ride no longer dispatching between offers → chain ends inactive, no debit", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d1", "d2"]), dispatching: true });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);
    await flush();
    // Rider cancels while d1's offer is settling — the status flip lands
    // BEFORE d2's between-offers re-check runs.
    resolvePendingOffer("ride-1", "d1", "rejected");
    h.dispatching = false;
    await jest.advanceTimersByTimeAsync(0);
    await expect(chain).resolves.toBe("inactive");
    expect(h.offeredDrivers).toEqual(["d1"]); // d2 never billed/offered
  });

  test("disconnected candidate is skipped without a debit", async () => {
    const { deps, h } = makeDeps({ connected: new Set(["d2"]) });
    const chain = runSequentialChain("ride-1", candidates("d1", "d2"), deps);
    await flush();
    resolvePendingOffer("ride-1", "d2", "accepted");
    await expect(chain).resolves.toBe("matched");
    expect(h.calls.find((c) => c.op === "debit" && c.driverId === "d1")).toBeUndefined();
  });

  test("auto-accept race loss → chain ends inactive on the status re-check", async () => {
    const pool: ChainCandidate[] = [
      { driverId: "racer", auto_accept_eligible: true },
      { driverId: "next", auto_accept_eligible: false },
    ];
    const { deps, h } = makeDeps({
      connected: new Set(["racer", "next"]),
      autoAcceptMatch: new Map([["racer", false]]),
    });
    const chain = runSequentialChain("ride-1", pool, deps);
    await expect(chain).resolves.toBe("inactive");
    // The race-loser WAS billed (they consumed an offer slot) — no refund
    expect(h.calls).toContainEqual({ op: "debit", driverId: "racer" });
    expect(h.calls).toContainEqual({ op: "lead-billed", driverId: "racer" });
    expect(h.offeredDrivers).toEqual([]); // no ride:offer sent — match flow ran directly
  });
});

describe("registry guards", () => {
  test("resolvePendingOffer ignores mismatched driver / missing chain (no-op)", () => {
    expect(registerChain("ride-x", [])).toBe(true);
    expect(resolvePendingOffer("ride-x", "wrong-driver", "accepted")).toBe(false);
    expect(resolvePendingOffer("ride-missing", "any", "accepted")).toBe(false);
    expect(hasPendingOffer("ride-x")).toBe(false);
  });

  test("abortChain on unknown ride returns null", () => {
    expect(abortChain("nope")).toBeNull();
  });
});
