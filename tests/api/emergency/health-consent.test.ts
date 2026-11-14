// @ts-nocheck — Jest mock factories produce untyped DB/auth chains; runtime
// behavior is what's under test (house pattern).
/**
 * POST /api/emergency/requests — health consent gate (§7).
 *
 * - 400s health_consent_required when patient_condition is present without
 *   health_consent_granted:true (and writes nothing).
 * - 201s with health_consent_granted:true, storing the grant + timestamp.
 */
import { jest } from "@jest/globals";

let mockInsertedVals: Record<string, unknown>[] = [];
let mockInsertCalled = 0;

jest.mock("@/lib/auth", () => ({
  verifySupabaseToken: jest.fn(async () => ({ id: "auth-1" })),
}));

jest.mock("@/lib/supabaseServer", () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => ({ data: { id: "caller-uuid-1" } })),
        })),
      })),
    })),
  },
}));

jest.mock("@/lib/platformConfig", () => ({
  isVerticalEnabled: jest.fn(async () => true),
  getConfigInt: jest.fn(async () => 120),
}));

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/src/db", () => ({
  db: {
    insert: jest.fn((_table: unknown) => ({
      values: jest.fn((vals: Record<string, unknown>) => {
        mockInsertedVals.push(vals);
        mockInsertCalled += 1;
        return {
          returning: jest.fn(async () => [{ id: "req-1", ...vals }]),
        };
      }),
    })),
  },
}));

/* eslint-disable import/first */
import { POST } from "@/app/api/emergency/requests+api";

const emergencyBody = (overrides: Record<string, unknown> = {}) => ({
  pickup_address: "Dhaka Medical College",
  pickup_lat: 23.81,
  pickup_lng: 90.41,
  patient_condition: "Chest pain, conscious",
  requires_paramedic: false,
  service_level: "BLS",
  ...overrides,
});

const makeRequest = (body: unknown) =>
  new Request("http://localhost/api/emergency/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mockInsertedVals = [];
  mockInsertCalled = 0;
});

describe("POST /api/emergency/requests — health consent (§7)", () => {
  it("400s health_consent_required when notes are sent without consent", async () => {
    const res = await POST(makeRequest(emergencyBody({ health_consent_granted: false })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("health_consent_required");
    expect(mockInsertCalled).toBe(0);
  });

  it("400s health_consent_required when the flag is omitted (defaults false)", async () => {
    const { health_consent_granted: _omit, ...noFlag } = emergencyBody();
    void _omit;
    const res = await POST(makeRequest(noFlag));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("health_consent_required");
    expect(mockInsertCalled).toBe(0);
  });

  it("201s with consent, storing the grant and timestamp", async () => {
    const res = await POST(makeRequest(emergencyBody({ health_consent_granted: true })));
    expect(res.status).toBe(201);
    expect(mockInsertCalled).toBe(1);
    expect(mockInsertedVals[0]).toMatchObject({ healthConsentGranted: true });
    expect(mockInsertedVals[0].healthConsentAt).toBeInstanceOf(Date);
  });
});
