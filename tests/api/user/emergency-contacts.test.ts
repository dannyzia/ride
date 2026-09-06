/**
 * P1-12 (gap ledger): user emergency-contacts CRUD — the SOS SMS recipient
 * source (FEATURES trust surface). Asserts:
 *  - GET returns contacts + the max_contacts=5 contract
 *  - POST enforces the max-5 gate BEFORE body validation, validates the
 *    10-15 digit phone format, and inserts with relationship NULL fallback
 *  - DELETE scopes the hard delete to BOTH the contact id AND the owner
 *    (cross-user deletion must be structurally impossible — asserted via
 *    PgDialect SQL-ification of the where predicate)
 */
/* eslint-disable import/first */
jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock("@/src/db", () => ({
  db: { select: jest.fn(), insert: jest.fn(), delete: jest.fn() },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "@/src/db";
import { verifySupabaseToken } from "@/lib/auth";
import { userEmergencyContacts } from "@/src/db/schema";
import { GET, POST, DELETE } from "@/app/api/user/emergency-contacts+api";

const SUPABASE_UID = "11111111-1111-4111-a111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CONTACT_ID = "33333333-3333-4333-8333-333333333333";

type Row = Record<string, unknown>;

function request(body?: unknown, url = "http://localhost/test"): Request {
  return {
    json: body === undefined ? undefined : async () => body,
    url,
  } as unknown as Request;
}

function getJson(res: Response): Promise<Record<string, unknown>> {
  return res.json() as Promise<Record<string, unknown>>;
}

function mockSelectQueue(queue: Row[][]): void {
  let callIndex = 0;
  (db.select as jest.Mock).mockImplementation(() => {
    const rows = queue[callIndex] ?? [];
    callIndex++;
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => rows,
      then: (res: (v: unknown) => void, rej: (e: unknown) => void) =>
        Promise.resolve(rows).then(res, rej),
    };
    return chain;
  });
}

const inserted: { table: unknown; values: Row }[] = [];
let deletedWhere: SQL | undefined;

beforeEach(() => {
  jest.clearAllMocks();
  inserted.length = 0;
  deletedWhere = undefined;
  (verifySupabaseToken as jest.Mock).mockResolvedValue({ id: SUPABASE_UID });
  (db.insert as jest.Mock).mockImplementation((table: unknown) => ({
    values: jest.fn((v: Row) => {
      inserted.push({ table, values: v });
      return {
        returning: jest.fn(async () => [{ id: CONTACT_ID, ...v }]),
      };
    }),
  }));
  (db.delete as jest.Mock).mockImplementation((_table: unknown) => ({
    where: jest.fn((w: SQL) => {
      deletedWhere = w;
      return Promise.resolve([]);
    }),
  }));
});

describe("GET /api/user/emergency-contacts", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await GET(request());
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await GET(request());
    expect(res.status).toBe(404);
  });

  test("returns contacts with the max_contacts=5 contract", async () => {
    const contacts = [{ id: CONTACT_ID, name: "Amma", phone: "+8801712345678", relationship: "mother" }];
    mockSelectQueue([[{ id: USER_ID }], contacts]);

    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await getJson(res);
    expect(body.contacts).toEqual(contacts);
    expect(body.max_contacts).toBe(5);
  });
});

describe("POST /api/user/emergency-contacts", () => {
  const VALID = { name: "Amma", phone: "+8801712345678", relationship: "mother" };

  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await POST(request(VALID));
    expect(res.status).toBe(401);
  });

  test("404 user_not_found", async () => {
    mockSelectQueue([[]]);
    const res = await POST(request(VALID));
    expect(res.status).toBe(404);
  });

  test("422 max_contacts_reached BEFORE body validation is even consulted", async () => {
    // count select (2nd call) returns 5 — even an invalid body must 422
    mockSelectQueue([[{ id: USER_ID }], [{ value: 5 }]]);
    const res = await POST(request({ name: "", phone: "bad" }));
    expect(res.status).toBe(422);
    expect((await getJson(res)).error).toBe("max_contacts_reached");
  });

  test("400 validation_error for a malformed phone", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ value: 0 }]]);
    const res = await POST(request({ name: "Amma", phone: "12345" }));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("validation_error");
  });

  test("201 inserts scoped to the caller; missing relationship stored as null", async () => {
    mockSelectQueue([[{ id: USER_ID }], [{ value: 2 }]]);

    const res = await POST(request({ name: "Bhai", phone: "01712345678" }));
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].table).toBe(userEmergencyContacts);
    expect(inserted[0].values).toMatchObject({
      user_id: USER_ID,
      name: "Bhai",
      phone: "01712345678",
      relationship: null,
    });
  });
});

describe("DELETE /api/user/emergency-contacts", () => {
  test("401 unauthorized", async () => {
    (verifySupabaseToken as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await DELETE(request(undefined, `http://localhost/test?id=${CONTACT_ID}`));
    expect(res.status).toBe(401);
  });

  test("400 invalid_uuid when the id param is missing", async () => {
    mockSelectQueue([[{ id: USER_ID }]]);
    const res = await DELETE(request(undefined, "http://localhost/test"));
    expect(res.status).toBe(400);
    expect((await getJson(res)).error).toBe("invalid_uuid");
  });

  test("400 invalid_uuid when the id param is not a uuid", async () => {
    mockSelectQueue([[{ id: USER_ID }]]);
    const res = await DELETE(request(undefined, "http://localhost/test?id=abc"));
    expect(res.status).toBe(400);
  });

  test("delete predicate is scoped to contact id AND owner (cross-user deletion impossible)", async () => {
    mockSelectQueue([[{ id: USER_ID }]]);

    const res = await DELETE(request(undefined, `http://localhost/test?id=${CONTACT_ID}`));
    expect(res.status).toBe(200);
    expect(await getJson(res)).toEqual({ success: true });

    expect(deletedWhere).toBeDefined();
    const rendered = new PgDialect().sqlToQuery(deletedWhere as SQL);
    expect(rendered.sql).toContain('"user_emergency_contacts"."id" = $');
    expect(rendered.sql).toContain('"user_emergency_contacts"."user_id" = $');
    expect(rendered.params).toContain(CONTACT_ID);
    expect(rendered.params).toContain(USER_ID);
  });
});
