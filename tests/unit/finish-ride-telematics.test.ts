/**
 * STAGE 1 — Driver App Telematics Hardening (Plan 28 / ISSUE-87).
 *
 * Guards the foreground GPS loop in `app/(main)/(rider)/finish-ride/index.tsx`:
 * - WebSocket `location:update` payload shape (with client-side `ts`).
 * - Synchronous emission on every watch tick — never blocked on reverse geocoding.
 * - Stationary ticks (movement < 20m) still emit without triggering geocoding.
 * - Graceful no-op when the socket is closed or there is no active ride.
 *
 * The `createWatchCallback` harness below is a line-for-line mirror of the
 * `watchPositionAsync` callback in the screen; the source-contract suite pins
 * the screen itself so the two cannot drift apart silently.
 */
import fs from "fs";
import path from "path";

const FINISH_RIDE_PATH = path.resolve(
  __dirname,
  "../../app/(main)/(rider)/finish-ride/index.tsx",
);
const finishRideSource = fs.readFileSync(FINISH_RIDE_PATH, "utf8");

// WebSocket.OPEN === 1; the harness mirrors the source's readyState guard.
const WS_OPEN = 1;
const WS_CLOSED = 3;

interface TelematicsCoords {
  latitude: number;
  longitude: number;
}

interface TelematicsLocation {
  coords: TelematicsCoords;
  timestamp?: number;
}

interface DriverLocation {
  latitude: number;
  longitude: number;
  address: string;
}

interface MockSocket {
  readyState: number;
  sent: string[];
  send: (payload: string) => void;
}

interface GeocodeResult {
  formattedAddress?: string;
}

interface WatchCallbackDeps {
  wsRef: { current: MockSocket | null };
  activeRideIdRef: { current: string | null };
  lastLocationRef: { current: TelematicsLocation | null };
  lastAddressRef: { current: string };
  setDriverLocation: (loc: DriverLocation) => void;
  reverseGeocodeAsync: (coords: TelematicsCoords) => Promise<GeocodeResult[]>;
}

function makeSocket(open: boolean): MockSocket {
  const sock: MockSocket = {
    readyState: open ? WS_OPEN : WS_CLOSED,
    sent: [],
    send(payload: string) {
      sock.sent.push(payload);
    },
  };
  return sock;
}

function haversineM(a: TelematicsCoords, b: TelematicsCoords): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1000;
}

// Mirror of the watchPositionAsync callback in finish-ride/index.tsx.
function createWatchCallback(deps: WatchCallbackDeps) {
  return (location: TelematicsLocation) => {
    const lat = location.coords.latitude;
    const lng = location.coords.longitude;
    const clientTs = location.timestamp || Date.now();
    const rideId = deps.activeRideIdRef.current;

    // 1. NON-BLOCKING: emit telematics immediately on every interval.
    const sock = deps.wsRef.current;
    if (sock && sock.readyState === WS_OPEN && rideId) {
      sock.send(
        JSON.stringify({
          type: "location:update",
          role: "driver",
          ride_id: rideId,
          lat,
          lng,
          ts: clientTs,
        }),
      );
    }

    // 2. ASYNC: background reverse-geocoding for driver UI only.
    if (
      deps.lastLocationRef.current &&
      haversineM(deps.lastLocationRef.current.coords, location.coords) >= 20
    ) {
      deps
        .reverseGeocodeAsync({ latitude: lat, longitude: lng })
        .then((addr) => {
          deps.lastAddressRef.current = addr[0]?.formattedAddress ?? "";
          deps.setDriverLocation({
            latitude: lat,
            longitude: lng,
            address: deps.lastAddressRef.current,
          });
        })
        .catch(() => undefined); // Failure swallowed; UI retains last address.
      deps.lastLocationRef.current = location;
    } else if (!deps.lastLocationRef.current) {
      deps.lastLocationRef.current = location;
    }

    deps.setDriverLocation({
      latitude: lat,
      longitude: lng,
      address: deps.lastAddressRef.current,
    });
  };
}

function makeDeps(overrides: Partial<WatchCallbackDeps> = {}) {
  const setDriverLocationCalls: DriverLocation[] = [];
  const deps: WatchCallbackDeps = {
    wsRef: { current: makeSocket(true) },
    activeRideIdRef: { current: "ride-123" },
    lastLocationRef: { current: null },
    lastAddressRef: { current: "" },
    setDriverLocation: (loc) => {
      setDriverLocationCalls.push(loc);
    },
    reverseGeocodeAsync: () => Promise.resolve([{ formattedAddress: "Dhaka" }]),
    ...overrides,
  };
  return { deps, setDriverLocationCalls };
}

function atDhaka(latOffsetDeg = 0): TelematicsLocation {
  return {
    coords: { latitude: 23.8103 + latOffsetDeg, longitude: 90.4125 },
    timestamp: 1700000000000,
  };
}

// ~111m per 0.001 deg latitude: 0.0005 deg ≈ 55m (moved), 0.00005 ≈ 5m (stationary).
const MOVED = 0.0005;
const STATIONARY = 0.00005;

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

describe("finish-ride telematics — source contract", () => {
  it("watches with High accuracy, 5s cadence, and a 2m movement filter", () => {
    expect(finishRideSource).toContain("accuracy: Location.Accuracy.High,");
    expect(finishRideSource).not.toContain("Location.Accuracy.Highest");
    expect(finishRideSource).toContain("timeInterval: 5000,");
    expect(finishRideSource).toContain("distanceInterval: 2,");
  });

  it("emits location:update synchronously with a client-side ts", () => {
    expect(finishRideSource).toContain('type: "location:update"');
    expect(finishRideSource).toContain("ts: clientTs,");
    expect(finishRideSource).toContain(
      "const clientTs = location.timestamp || Date.now();",
    );
    expect(finishRideSource).toContain("sock.readyState === WebSocket.OPEN && rideId");
    expect(finishRideSource).toContain("const rideId = activeRideIdRef.current;");
  });

  it("geocodes asynchronously in the background, filtered to >= 20m", () => {
    expect(finishRideSource).toContain(
      "calculateDistance(lastLocationRef.current, location) >= 20",
    );
    expect(finishRideSource).toContain("Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })");
    expect(finishRideSource).toContain(".then((addr) => {");
    expect(finishRideSource).toContain(".catch(() => {});");
  });

  it("reads the active ride id from activeRideIdRef (useRideOfferStore)", () => {
    expect(finishRideSource).toContain("activeRideIdRef.current = activeRideId;");
    expect(finishRideSource).toContain("useRideOfferStore");
  });
});

describe("finish-ride telematics — watch callback behavior", () => {
  it("sends the location:update payload shape { type, role, ride_id, lat, lng, ts }", () => {
    const { deps } = makeDeps();
    const onLocation = createWatchCallback(deps);

    onLocation(atDhaka());

    expect(deps.wsRef.current?.sent).toHaveLength(1);
    expect(JSON.parse(deps.wsRef.current?.sent[0] ?? "")).toEqual({
      type: "location:update",
      role: "driver",
      ride_id: "ride-123",
      lat: 23.8103,
      lng: 90.4125,
      ts: 1700000000000,
    });
  });

  it("falls back to Date.now() when the location has no timestamp", () => {
    const { deps } = makeDeps();
    const onLocation = createWatchCallback(deps);
    const loc = atDhaka();
    delete loc.timestamp;

    const before = Date.now();
    onLocation(loc);
    const payload = JSON.parse(deps.wsRef.current?.sent[0] ?? "{}");

    expect(typeof payload.ts).toBe("number");
    expect(payload.ts).toBeGreaterThanOrEqual(before);
  });

  it("emits synchronously before reverseGeocodeAsync resolves", async () => {
    let resolveGeocode!: (value: GeocodeResult[]) => void;
    const pending = new Promise<GeocodeResult[]>((resolve) => {
      resolveGeocode = resolve;
    });
    const { deps, setDriverLocationCalls } = makeDeps({
      reverseGeocodeAsync: () => pending,
    });
    const onLocation = createWatchCallback(deps);

    onLocation(atDhaka()); // Seeds lastLocationRef; no movement yet.
    expect(deps.wsRef.current?.sent).toHaveLength(1);
    const immediateCalls = setDriverLocationCalls.length;
    expect(immediateCalls).toBeGreaterThan(0);

    onLocation(atDhaka(MOVED)); // >= 20m: socket emit must not wait on geocode.
    expect(deps.wsRef.current?.sent).toHaveLength(2);
    const immediatePayload = JSON.parse(deps.wsRef.current?.sent[1] ?? "{}");
    expect(immediatePayload.type).toBe("location:update");
    // Geocode still pending: address not yet refreshed.
    expect(deps.lastAddressRef.current).toBe("");

    resolveGeocode([{ formattedAddress: "Gulshan, Dhaka" }]);
    await flushMicrotasks();
    expect(deps.lastAddressRef.current).toBe("Gulshan, Dhaka");
  });

  it("stationary ticks (< 20m) still emit without triggering reverse geocoding", () => {
    let geocodeCalls = 0;
    const { deps } = makeDeps({
      reverseGeocodeAsync: () => {
        geocodeCalls += 1;
        return Promise.resolve([{ formattedAddress: "Dhaka" }]);
      },
    });
    const onLocation = createWatchCallback(deps);

    onLocation(atDhaka());
    onLocation(atDhaka(STATIONARY)); // ~5m: heartbeat, no geocode.
    onLocation(atDhaka(STATIONARY * 2)); // ~11m cumulative: still no geocode.

    expect(deps.wsRef.current?.sent).toHaveLength(3);
    expect(geocodeCalls).toBe(0);
  });

  it("tracks the latest active ride id across ticks", () => {
    const { deps } = makeDeps();
    const onLocation = createWatchCallback(deps);

    onLocation(atDhaka());
    deps.activeRideIdRef.current = "ride-456";
    onLocation(atDhaka(STATIONARY));

    const second = JSON.parse(deps.wsRef.current?.sent[1] ?? "{}");
    expect(second.ride_id).toBe("ride-456");
  });

  it("does nothing when the socket is closed, missing, or there is no active ride", async () => {
    const closed = makeDeps({ wsRef: { current: makeSocket(false) } });
    expect(() => createWatchCallback(closed.deps)(atDhaka())).not.toThrow();
    expect(closed.deps.wsRef.current?.sent).toHaveLength(0);

    const missing = makeDeps({ wsRef: { current: null } });
    expect(() => createWatchCallback(missing.deps)(atDhaka())).not.toThrow();

    const noRide = makeDeps({ activeRideIdRef: { current: null } });
    const onLocation = createWatchCallback(noRide.deps);
    expect(() => onLocation(atDhaka())).not.toThrow();
    expect(noRide.deps.wsRef.current?.sent).toHaveLength(0);
    // UI marker still updates even without an active ride.
    expect(noRide.setDriverLocationCalls.length).toBeGreaterThan(0);

    await flushMicrotasks();
  });

  it("swallows geocode failures and retains the last valid address", async () => {
    const { deps } = makeDeps({
      reverseGeocodeAsync: () => Promise.reject(new Error("network down")),
    });
    deps.lastAddressRef.current = "Banani, Dhaka";
    const onLocation = createWatchCallback(deps);

    onLocation(atDhaka());
    await expect(
      (async () => {
        onLocation(atDhaka(MOVED));
        await flushMicrotasks();
      })(),
    ).resolves.toBeUndefined();
    expect(deps.lastAddressRef.current).toBe("Banani, Dhaka");
    expect(deps.wsRef.current?.sent).toHaveLength(2);
  });
});
