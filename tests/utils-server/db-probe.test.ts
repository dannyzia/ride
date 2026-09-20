/**
 * ISSUE-62 regression tests — the watchdog's dedicated probe connection
 * (utils-server/dbProbe.ts).
 *
 * These pin the connection-level contract that makes the watchdog trustworthy.
 * The probe must NOT share the application pool: src/db/index.ts sets `max: 5`
 * for the whole process while the scheduler runs 58 jobs, so a pool probe times
 * out on queue wait — that is what produced a ~55s self-kill loop (24 restarts
 * in one session) while an independent client answered `select 1` in 144–233ms
 * and `pg_stat_activity` showed zero stuck transactions.
 *
 * Kept in its own file because the watchdog suite mocks this module wholesale.
 *
 * `getProbeClient` holds a module-scoped lazy singleton, so every test loads a
 * FRESH copy of the module through `jest.isolateModules` — otherwise the first
 * test's connection leaks into the others and the construction assertions
 * silently read someone else's singleton.
 */
jest.mock("postgres", () => ({
  __esModule: true,
  default: jest.fn(),
}));

import postgres from "postgres";

const postgresMock = postgres as unknown as jest.Mock;

/** Load the module in its own registry and return its `getProbeClient`. */
function freshGetProbeClient(): () => unknown {
  let fn: (() => unknown) | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    fn = require("../../utils-server/dbProbe").getProbeClient;
  });
  if (!fn) throw new Error("dbProbe.getProbeClient not loaded");
  return fn;
}

describe("getProbeClient", () => {
  const previousUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    postgresMock.mockReset();
    postgresMock.mockReturnValue({ kind: "probe-client" });
    process.env.DATABASE_URL = "postgres://user:pass@example.test:5432/db";
  });

  afterEach(() => {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  });

  it("allocates ONE connection the scheduler cannot occupy (max: 1)", () => {
    freshGetProbeClient()();
    expect(postgresMock).toHaveBeenCalledTimes(1);
    const options = postgresMock.mock.calls[0][1] as Record<string, unknown>;
    // max: 1 is the entire point — one reserved slot that scheduler work
    // cannot take, so pool contention can never masquerade as a DB outage.
    expect(options.max).toBe(1);
    // idle_timeout: 0 keeps that slot reserved — a closed idle connection would
    // put a cold connect (worst case ~5.8s, measured) back in the probe budget.
    expect(options.idle_timeout).toBe(0);
    // Required by the transaction-mode pooler (6543), harmless on 5432.
    expect(options.prepare).toBe(false);
  });

  it("memoizes the client — one connection for the life of the process", () => {
    const getProbeClient = freshGetProbeClient();
    const first = getProbeClient();
    const second = getProbeClient();
    expect(first).toBe(second);
    expect(postgresMock).toHaveBeenCalledTimes(1);
  });

  it("throws when DATABASE_URL is absent instead of silently probing nothing", () => {
    const getProbeClient = freshGetProbeClient();
    delete process.env.DATABASE_URL;
    expect(() => getProbeClient()).toThrow(/DATABASE_URL/);
    expect(postgresMock).not.toHaveBeenCalled();
  });
});
