// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime behavior is
// what's under test (Phase 5 precedent, tests/api/rental/truck-rental.test.ts).
/**
 * C8-5 — fleet staff invite: removed_at-filtered duplicate check + keyed push.
 *
 * POST /api/fleet/staff?fleet_id=...:
 * - live member (removed_at NULL) re-invited → 409 already_member
 * - removed member (removed_at set) re-invited → 201 reactivated:true (same
 *   row revived — the fm_fleet_user_idx unique would 23505 on INSERT)
 * - fresh user → 201 reactivated:false
 * - every successful invite emits the keyed push
 *   `fleet_staff_invite:{memberId}:{userId}` (+ WS event), fire-and-forget
 *
 * Invokes the REAL handler + the REAL fleetNotify helper; only DB/auth and
 * the push/WS transports are mocked.
 */

import { POST as inviteStaff } from "@/app/api/fleet/staff+api";
import { notifyWs } from "@/lib/wsNotify";
import { sendNotification } from "@/lib/notify";

const mockFleetId = "00000000-0000-4000-8000-0000000000d4";
const mockTargetId = "00000000-0000-4000-8000-0000000000e5";
const mockMemberId = "00000000-0000-4000-8000-0000000000f6";

let mockExistingRow: Record<string, unknown> | null | undefined = undefined;
let mockTargetUser: Record<string, unknown> | null = { id: mockTargetId };
let mockUpdateCalls: Record<string, unknown>[] = [];
let mockInsertCalls: Record<string, unknown>[] = [];

jest.mock("@/src/db", () => {
  const schema = require("@/src/db/schema");
  const T = {
    members: schema.fleetMembers,
    users: schema.users,
    fleets: schema.fleets,
  };

  const chainable = (rows: unknown[]) => {
    const c: any = () => {};
    c.limit = () => c;
    c.then = (res: any, rej: any) => Promise.resolve(rows).then(res, rej);
    return c;
  };

  const selectFn = () => ({
    from: (t: unknown) => ({
      innerJoin: () => ({ where: () => chainable([]) }),
      where: () => {
        if (t === T.members) return chainable(mockExistingRow ? [mockExistingRow] : []);
        if (t === T.users) return chainable(mockTargetUser ? [mockTargetUser] : []);
        if (t === T.fleets) return chainable([{ name: "Test Fleet" }]);
        return chainable([]);
      },
    }),
  });

  const updateFn = () => ({
    set: (vals: Record<string, unknown>) => ({
      where: () => {
        mockUpdateCalls.push(vals);
        return { returning: async () => [{ id: mockMemberId }] };
      },
    }),
  });

  const insertFn = () => ({
    values: (vals: Record<string, unknown>) => {
      mockInsertCalls.push(vals);
      return { returning: async () => [{ id: mockMemberId }] };
    },
  });

  return {
    db: { select: selectFn, update: updateFn, insert: insertFn },
  };
});

jest.mock("@/lib/auth", () => ({
  requireFleetMember: (_fleetId: string, _roles?: readonly string[]) => async () => ({
    supabaseUser: { id: "auth-test" },
    dbUser: { id: "owner-1" },
    membership: { id: "fm-owner", fleet_id: _fleetId, role: "OWNER" },
  }),
}));

jest.mock("@/lib/notify", () => ({
  sendNotification: jest.fn(async () => {}),
}));

jest.mock("@/lib/wsNotify", () => ({
  notifyWs: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

function inviteRequest(body: unknown) {
  return new Request(`http://localhost/api/fleet/staff?fleet_id=${mockFleetId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockExistingRow = undefined;
  mockTargetUser = { id: mockTargetId };
  mockUpdateCalls = [];
  mockInsertCalls = [];
  jest.clearAllMocks();
});

describe("C8-5 — staff re-invite duplicate check", () => {
  it("live member (removed_at NULL) → 409 already_member, no write", async () => {
    mockExistingRow = { id: mockMemberId, removed_at: null };
    const res = await inviteStaff(
      inviteRequest({ user_id: mockTargetId, role: "DISPATCHER" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "already_member",
      message: "User is already a member of this fleet",
    });
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateCalls).toHaveLength(0);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("removed member (removed_at set) → 201 reactivated, row revived not inserted", async () => {
    mockExistingRow = { id: mockMemberId, removed_at: "2026-01-01T00:00:00.000Z" };
    const res = await inviteStaff(
      inviteRequest({ user_id: mockTargetId, role: "DISPATCHER" }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      member_id: mockMemberId,
      success: true,
      reactivated: true,
    });
    expect(mockInsertCalls).toHaveLength(0);
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0]).toMatchObject({
      removed_at: null,
      status: "active",
      role: "DISPATCHER",
    });
  });

  it("fresh user → 201 inserted, reactivated:false", async () => {
    mockExistingRow = null;
    const res = await inviteStaff(
      inviteRequest({ user_id: mockTargetId, role: "VIEWER" }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      member_id: mockMemberId,
      success: true,
      reactivated: false,
    });
    expect(mockInsertCalls).toHaveLength(1);
  });
});

describe("C8-5 — staff invite keyed push (C6-2 bell pattern)", () => {
  it("successful invite pushes with the member-scoped idempotency key + WS event", async () => {
    mockExistingRow = null;
    const res = await inviteStaff(
      inviteRequest({ user_id: mockTargetId, role: "MANAGER" }),
    );
    expect(res.status).toBe(201);
    // The route fires the invite notify WITHOUT awaiting it — flush the
    // microtask queue so the void chain (push await + WS emit) settles.
    await new Promise((r) => setImmediate(r));
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const [userId, type, title, body, data, opts] = (sendNotification as jest.Mock).mock.calls[0];
    expect(userId).toBe(mockTargetId);
    expect(type).toBe("fleet:staff_invite");
    expect(title).toBeTruthy();
    expect(body).toBeTruthy();
    expect(data).toMatchObject({ fleet_id: mockFleetId, member_id: mockMemberId });
    expect(opts.idempotencyKey).toBe(`fleet_staff_invite:${mockMemberId}:${mockTargetId}`);
    expect(notifyWs).toHaveBeenCalledTimes(1);
    expect((notifyWs as jest.Mock).mock.calls[0][0][0]).toMatchObject({
      event: "fleet:staff_invite",
      to: [{ kind: "user", user_id: mockTargetId }],
    });
  });
});
