/**
 * Barikoi firm-route client tests (SG-1, Phase F quote state 2).
 * global.fetch is mocked; the client must return null on non-200, timeout,
 * and malformed responses — never throw (callers' low-confidence path
 * handles null uniformly per ruling 11).
 */

const KEY = "test-key";

let fetchMock: jest.Mock;

// Static import — jest-expo runs without --experimental-vm-modules, so
// dynamic import() is unavailable. The module reads BARIKOI_API_KEY at call
// time, so per-test env mutation still works.
import { getFirmRouteKm } from "../barikoiRoute";

beforeEach(() => {
  process.env.BARIKOI_API_KEY = KEY;
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  jest.useRealTimers();
});

function okRoute(distanceM: number): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ code: "Ok", routes: [{ distance: distanceM, duration: 300 }] }),
  } as unknown as Response;
}

describe("getFirmRouteKm", () => {
  test("success → distanceKm = metres / 1000, GeoJSON lng,lat URL", async () => {
    fetchMock.mockResolvedValue(okRoute(4321));

    const res = await getFirmRouteKm(23.0, 90.0, 23.1, 90.1);

    expect(res).toEqual({ distanceKm: 4.321 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("https://barikoi.xyz/v2/api/route/90,23;90.1,23.1");
    expect(url).toContain(`api_key=${KEY}`);
    expect(url).toContain("geometries=polyline");
  });

  test("non-200 → null", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

    expect(await getFirmRouteKm(23, 90, 23.1, 90.1)).toBeNull();
  });

  test("malformed body (code !== 'Ok') → null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: "NoRoute", routes: [] }),
    } as unknown as Response);

    expect(await getFirmRouteKm(23, 90, 23.1, 90.1)).toBeNull();
  });

  test("malformed distance → null", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: "Ok", routes: [{ distance: "far" }] }),
    } as unknown as Response);

    expect(await getFirmRouteKm(23, 90, 23.1, 90.1)).toBeNull();
  });

  test("8s timeout (AbortController) → null, never throws", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const pending = getFirmRouteKm(23, 90, 23.1, 90.1);
    const assertion = expect(pending).resolves.toBeNull();
    await jest.advanceTimersByTimeAsync(8_000);
    await assertion;
  });

  test("network error → null (never throws)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    expect(await getFirmRouteKm(23, 90, 23.1, 90.1)).toBeNull();
  });

  test("missing API key → null without any fetch call", async () => {
    delete process.env.BARIKOI_API_KEY;

    expect(await getFirmRouteKm(23, 90, 23.1, 90.1)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
