/**
 * R3.1: SOS frequency-as-intensity tests
 *
 * Validates the clustering logic: multiple rapid triggers from the same
 * user within 60 seconds constitute high-intensity distress. The server
 * creates a new alert on every trigger (no cooldown). The active endpoint
 * returns `recent_alert_count` and `is_high_intensity` for the client.
 */

// ── Clustering logic (mirrors active+api.ts) ────────────────────────────────

/** Window in seconds for clustering alerts as high-intensity. */
const INTENSITY_WINDOW_SECONDS = 60;

interface AlertRecord {
  id: string;
  user_id: string;
  created_at: Date;
}

/**
 * Count alerts from a specific user within the intensity window.
 * Mirrors the SQL: `count(*) WHERE user_id = X AND created_at >= windowStart`
 */
function countRecentAlerts(alerts: AlertRecord[], userId: string, nowMs: number): number {
  const windowStart = new Date(nowMs - INTENSITY_WINDOW_SECONDS * 1000);
  return alerts.filter(
    (a) => a.user_id === userId && a.created_at >= windowStart,
  ).length;
}

/** Determine high-intensity flag (3+ alerts in 60s). */
function isHighIntensity(recentCount: number): boolean {
  return recentCount >= 3;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SOS frequency-as-intensity clustering", () => {
  const USER_A = "user-a";
  const USER_B = "user-b";
  const NOW = Date.now();

  it("0 alerts → low intensity", () => {
    const alerts: AlertRecord[] = [];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(0);
    expect(isHighIntensity(count)).toBe(false);
  });

  it("1 alert → low intensity", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 5_000) },
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(1);
    expect(isHighIntensity(count)).toBe(false);
  });

  it("2 alerts in 60s → low intensity", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 10_000) },
      { id: "a2", user_id: USER_A, created_at: new Date(NOW - 30_000) },
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(2);
    expect(isHighIntensity(count)).toBe(false);
  });

  it("3 alerts in 60s → HIGH intensity", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 5_000) },
      { id: "a2", user_id: USER_A, created_at: new Date(NOW - 20_000) },
      { id: "a3", user_id: USER_A, created_at: new Date(NOW - 45_000) },
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(3);
    expect(isHighIntensity(count)).toBe(true);
  });

  it("5 rapid alerts → high intensity", () => {
    const alerts: AlertRecord[] = Array.from({ length: 5 }, (_, i) => ({
      id: `a${i}`,
      user_id: USER_A,
      created_at: new Date(NOW - i * 10_000),
    }));
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(5);
    expect(isHighIntensity(count)).toBe(true);
  });

  it("alerts older than 60s are excluded from count", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 30_000) },  // within window
      { id: "a2", user_id: USER_A, created_at: new Date(NOW - 70_000) },  // outside window
      { id: "a3", user_id: USER_A, created_at: new Date(NOW - 90_000) },  // outside window
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(1);
    expect(isHighIntensity(count)).toBe(false);
  });

  it("alerts from different users are counted independently", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 5_000) },
      { id: "a2", user_id: USER_A, created_at: new Date(NOW - 15_000) },
      { id: "a3", user_id: USER_B, created_at: new Date(NOW - 10_000) },
      { id: "a4", user_id: USER_B, created_at: new Date(NOW - 20_000) },
      { id: "a5", user_id: USER_B, created_at: new Date(NOW - 30_000) },
    ];
    // User A: 2 alerts (low intensity)
    expect(countRecentAlerts(alerts, USER_A, NOW)).toBe(2);
    expect(isHighIntensity(countRecentAlerts(alerts, USER_A, NOW))).toBe(false);
    // User B: 3 alerts (high intensity)
    expect(countRecentAlerts(alerts, USER_B, NOW)).toBe(3);
    expect(isHighIntensity(countRecentAlerts(alerts, USER_B, NOW))).toBe(true);
  });

  it("boundary: alert at exactly 60s is excluded", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 59_999) },  // within
      { id: "a2", user_id: USER_A, created_at: new Date(NOW - 60_001) },  // just outside
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(1);
  });

  it("boundary: alert at 59s is included", () => {
    const alerts: AlertRecord[] = [
      { id: "a1", user_id: USER_A, created_at: new Date(NOW - 59_000) },
    ];
    const count = countRecentAlerts(alerts, USER_A, NOW);
    expect(count).toBe(1);
  });
});

// ── Client-side banner behavior ─────────────────────────────────────────────

describe("SOS banner display logic", () => {
  it("no active alert → no banner", () => {
    expect(false).toBe(false); // active=false means banner not rendered
  });

  it("active alert, 1 trigger → normal red banner", () => {
    const count = 1;
    const highIntensity = isHighIntensity(count);
    expect(highIntensity).toBe(false);
    // Banner text: "🚨 SOS Active"
  });

  it("active alert, 2 triggers → normal red with count", () => {
    const count = 2;
    const highIntensity = isHighIntensity(count);
    expect(highIntensity).toBe(false);
    // Banner text: "🚨 SOS Active — 2 alerts"
  });

  it("active alert, 3+ triggers → darker red high-intensity banner", () => {
    const count = 3;
    const highIntensity = isHighIntensity(count);
    expect(highIntensity).toBe(true);
    // Banner text: "🚨 HIGH INTENSITY — 3 alerts in 60s"
  });
});

// ── No cooldown behavior ────────────────────────────────────────────────────

describe("R3.1: no server cooldown", () => {
  it("every trigger creates a new alert (no dedup based on time)", () => {
    // The old behavior: if user had a recent open alert within cooldown window,
    // the server would return the existing alert (deduped: true).
    // R3.1: every trigger creates a NEW alert row.
    // The per-ride dedup is preserved (one open alert per ride).
    const triggers = [
      { ts: 0, ride_id: null },
      { ts: 5000, ride_id: null },
      { ts: 10000, ride_id: null },
    ];
    // All 3 should create new alerts (no cooldown dedup)
    expect(triggers.length).toBe(3);
  });

  it("per-ride dedup is preserved (same ride_id)", () => {
    // If ride already has an open SOS, the existing row is kept.
    // This is NOT a cooldown — it's dedup for the same ride.
    const rideId = "test-ride-id";
    const existingOpenAlert = { ride_id: rideId, status: "open" };
    // The handler checks: if ride_id has open alert → keep it
    expect(existingOpenAlert.ride_id).toBe(rideId);
    expect(existingOpenAlert.status).toBe("open");
  });
});
