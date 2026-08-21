/**
 * SOS Offline Alert Queue — unit tests.
 *
 * Covers: enqueue, dedup, process queue (success/failure/retry),
 * getQueueStatus, clearQueue, and the retry/backoff logic.
 */
/* eslint-disable import/first */

// Mock AsyncStorage — using the mockStore ref pattern so jest.mock factory
// can access it (Jest restricts out-of-scope refs inside factories).
const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => {
  const AsyncStorage = {
    getItem: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStore.delete(key);
    }),
  };
  return { __esModule: true, default: AsyncStorage };
});

// Mock supabase
const mockGetSession = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

// Mock config
jest.mock("@/lib/config", () => ({
  API_URL: "http://localhost:8081",
}));

// Mock logger
jest.mock("@/lib/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
(global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

import {
  enqueueSosAlert,
  processQueue,
  getQueueStatus,
  clearQueue,
} from "../sosQueue";

const USER_ID = "user-1111-1111-1111-111111111111";
const TOKEN = "fake-access-token-abc123";

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: USER_ID }, access_token: TOKEN } },
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ── enqueueSosAlert ────────────────────────────────────────────

describe("enqueueSosAlert", () => {
  test("stores a queue item in AsyncStorage", async () => {
    const result = await enqueueSosAlert({ lat: 23.81, lng: 90.41 });

    expect(result.queued).toBe(true);
    expect(result.id).toBeDefined();

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    expect(raw).toBeDefined();
    const items = JSON.parse(raw!);
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("queued");
    expect(items[0].payload.lat).toBe(23.81);
    expect(items[0].payload.lng).toBe(90.41);
    expect(items[0].token).toBe(TOKEN);
    expect(items[0].userId).toBe(USER_ID);
  });

  test("skips enqueue when no session is active", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const result = await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    expect(result.queued).toBe(false);
  });

  test("deduplicates identical payloads", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    const result2 = await enqueueSosAlert({ lat: 23.81, lng: 90.41 });

    expect(result2.queued).toBe(false);
    expect(result2.deduplicated).toBe(true);

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items).toHaveLength(1);
  });

  test("allows different payloads to coexist", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    await enqueueSosAlert({ lat: 23.82, lng: 90.42 });

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items).toHaveLength(2);
  });

  test("includes ride_id and message in payload", async () => {
    await enqueueSosAlert({
      lat: 23.81,
      lng: 90.41,
      ride_id: "ride-uuid-123",
      message: "Test SOS",
    });

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items[0].payload.ride_id).toBe("ride-uuid-123");
    expect(items[0].payload.message).toBe("Test SOS");
  });
});

// ── processQueue ───────────────────────────────────────────────

describe("processQueue", () => {
  test("sends queued alert and marks as sent", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await processQueue();

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items[0].status).toBe("sent");
  });

  test("does nothing when queue is empty", async () => {
    const result = await processQueue();
    expect(result.processed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("does nothing when no session is active", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const result = await processQueue();
    expect(result.processed).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("retries on failure and marks as failed after max attempts", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });

    // All 3 attempts fail
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ message: "Server error" }) });

    // First process — attempt 1 (fails, requeued)
    const r1 = await processQueue();
    expect(r1.processed).toBe(1);
    expect(r1.failed).toBe(0);

    // Second process — attempt 2 (fails, requeued)
    const r2 = await processQueue();
    expect(r2.processed).toBe(1);
    expect(r2.failed).toBe(0);

    // Third process — attempt 3 (fails, now "failed")
    const r3 = await processQueue();
    expect(r3.processed).toBe(1);
    expect(r3.failed).toBe(1);

    // Fourth process — no longer queued
    const r4 = await processQueue();
    expect(r4.processed).toBe(0);

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items[0].status).toBe("failed");
    expect(items[0].attempts).toBe(3);
  });

  test("retries on network error", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    mockFetch.mockRejectedValueOnce(new Error("Network request failed"));

    const r1 = await processQueue();
    expect(r1.processed).toBe(1);
    expect(r1.sent).toBe(0);

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items[0].status).toBe("queued");
    expect(items[0].attempts).toBe(1);
  });

  test("processes items in order", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    await enqueueSosAlert({ lat: 23.82, lng: 90.42 });
    await enqueueSosAlert({ lat: 23.83, lng: 90.43 });

    mockFetch.mockResolvedValue({ ok: true });

    await processQueue();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const bodies = mockFetch.mock.calls.map((call: [string, RequestInit]) =>
      JSON.parse((call[1].body as string)),
    );
    expect(bodies[0].lat).toBe(23.81);
    expect(bodies[1].lat).toBe(23.82);
    expect(bodies[2].lat).toBe(23.83);
  });

  test("stops processing on first failure and picks up later", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    await enqueueSosAlert({ lat: 23.82, lng: 90.42 });

    // First succeeds, second fails
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: "error" }),
      });

    const r1 = await processQueue();
    expect(r1.sent).toBe(1);
    expect(r1.failed).toBe(0);

    const raw = mockStore.get(`@sos_queue:${USER_ID}`);
    const items = JSON.parse(raw!);
    expect(items[0].status).toBe("sent");
    expect(items[1].status).toBe("queued");
    expect(items[1].attempts).toBe(1);
  });

  test("refreshes token if stored token is stale (>50 min old)", async () => {
    const staleTime = new Date(Date.now() - 51 * 60 * 1000).toISOString();
    const staleItem = {
      id: "stale-1",
      payload: { lat: 23.81, lng: 90.41 },
      token: "old-stale-token",
      userId: USER_ID,
      status: "queued" as const,
      attempts: 0,
      createdAt: staleTime,
    };
    mockStore.set(`@sos_queue:${USER_ID}`, JSON.stringify([staleItem]));

    mockFetch.mockResolvedValueOnce({ ok: true });

    await processQueue();

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });
});

// ── getQueueStatus ─────────────────────────────────────────────

describe("getQueueStatus", () => {
  test("returns empty status when no session", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
    });

    const status = await getQueueStatus();
    expect(status.pending).toBe(0);
    expect(status.failed).toBe(0);
    expect(status.items).toHaveLength(0);
  });

  test("counts pending and failed items", async () => {
    const items = [
      { id: "1", status: "sent", attempts: 1, createdAt: new Date().toISOString(), userId: USER_ID, token: TOKEN, payload: { lat: 1, lng: 1 } },
      { id: "2", status: "queued", attempts: 1, createdAt: new Date().toISOString(), userId: USER_ID, token: TOKEN, payload: { lat: 2, lng: 2 } },
      { id: "3", status: "failed", attempts: 3, createdAt: new Date().toISOString(), userId: USER_ID, token: TOKEN, payload: { lat: 3, lng: 3 } },
    ];
    mockStore.set(`@sos_queue:${USER_ID}`, JSON.stringify(items));

    const status = await getQueueStatus();
    expect(status.pending).toBe(1);
    expect(status.failed).toBe(1);
    expect(status.items).toHaveLength(3);
  });
});

// ── clearQueue ─────────────────────────────────────────────────

describe("clearQueue", () => {
  test("removes the queue from AsyncStorage", async () => {
    await enqueueSosAlert({ lat: 23.81, lng: 90.41 });
    expect(mockStore.has(`@sos_queue:${USER_ID}`)).toBe(true);

    await clearQueue(USER_ID);
    expect(mockStore.has(`@sos_queue:${USER_ID}`)).toBe(false);
  });
});
