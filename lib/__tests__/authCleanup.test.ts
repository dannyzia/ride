/**
 * Audit H-1: every sign-out path must run authCleanup(), and authCleanup()
 * must tear down the WebSocket BEFORE resetting stores — a live socket keeps
 * writing into the stores while they reset, and a stale authenticated
 * socket must never survive into the next sign-in. This test pins the
 * ordering contract: teardownRiderSocket fires before any store reset.
 */
/* eslint-disable import/first */
jest.mock("../riderSocket", () => ({
  teardownRiderSocket: jest.fn(),
}));

const calls: string[] = [];
jest.mock("../../store/useRiderStore", () => ({
  useRiderStore: { getState: () => ({ reset: () => calls.push("rider") }) },
}));
jest.mock("../../store/useDriverStore", () => ({
  useDriverStore: { getState: () => ({ reset: () => calls.push("driver") }) },
}));
jest.mock("../../store/useChatStore", () => ({
  useChatStore: { getState: () => ({ clearChat: () => calls.push("chat") }) },
}));
jest.mock("../../store/useDriverStatusStore", () => ({
  useDriverStatusStore: { getState: () => ({ clear: () => calls.push("driverStatus") }) },
}));
jest.mock("../../store/usePackageStore", () => ({
  usePackageStore: { getState: () => ({ clear: () => calls.push("package") }) },
}));
jest.mock("../../store/useCallLedgerStore", () => ({
  useCallLedgerStore: { getState: () => ({ clear: () => calls.push("callLedger") }) },
}));
jest.mock("../../store/useDriverFlowStore", () => ({
  useDriverFlowStore: { getState: () => ({ reset: () => calls.push("driverFlow") }) },
}));

import { teardownRiderSocket } from "../riderSocket";
import { authCleanup } from "../authCleanup";

describe("authCleanup (audit H-1)", () => {
  it("tears the WebSocket down first, then resets all 7 stores", () => {
    calls.length = 0;
    (teardownRiderSocket as jest.Mock).mockImplementation(() => calls.push("ws"));

    authCleanup();

    expect(calls[0]).toBe("ws");
    expect(calls.slice(1).sort()).toEqual([
      "callLedger",
      "chat",
      "driver",
      "driverFlow",
      "driverStatus",
      "package",
      "rider",
    ]);
    expect(teardownRiderSocket).toHaveBeenCalledTimes(1);
  });
});
