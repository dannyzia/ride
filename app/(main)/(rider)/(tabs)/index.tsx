import { View, Text, TouchableOpacity, Alert, Animated, StyleSheet, AccessibilityInfo } from "react-native";
import { StatusBar } from "expo-status-bar";
import { API_URL, WS_URL } from "@/lib/config";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import ReactNativeModal from "react-native-modal";
import { supabase } from "@/lib/supabase";
import { useDriverStore } from "@/store/useDriverStore";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useCallLedgerStore } from "@/store/useCallLedgerStore";
import { useRideOfferStore, useWSStore } from "@/store";
import SOSButton from "@/components/SOSButton";
import RideOfferSheet from "@/components/RideOfferSheet";
import DriverStatsBar from "@/components/DriverStatsBar";
import { showToast } from "@/components/Toast";
import ThemeToggle from "@/components/ThemeToggle";
import ScreenLabel from "@/components/ScreenLabel";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";
import { logger } from "@/lib/logger";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { relativeTime } from "@/lib/time";
import {
  nearestHotspot,
  haversineKm,
  demandLevel,
  type DemandLevel,
  type HotspotPoint,
} from "@/lib/hotspots";

// LOW-13: drivers.vehicle_type is a machine key (e.g. bike_standard); show the
// human label ("Bike Standard") in the header.
const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

interface DailyStats {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
  rating: number;
  acceptance_rate: number;
}

const RADAR_RING_COUNT = 3;
const RADAR_RING_SIZE = 120;
const GO_CIRCLE_SIZE = 80;

// Hotspot card: demand tier → label and dot color (green → amber → red,
// the same ramp as the hotspot-map heat overlay).
const DEMAND_LABEL: Record<DemandLevel, string> = {
  low: "Low demand",
  medium: "Moderate demand",
  high: "High demand",
};
const DEMAND_COLOR: Record<DemandLevel, string> = {
  low: colors.success,
  medium: colors.amber,
  high: colors.danger,
};

// Audit H-1 / L-a: the LATEST mounted screen's WS message handler. Every
// socket this screen wires routes messages through this module-level
// indirection instead of capturing a mount-local closure — so a reconnect
// scheduled by an unmounted onclose can never re-attach its stale handler
// (with its stale router/stores) to the fresh socket it creates. Cleanup on
// unmount nulls it; the next mount sets it again.
let driverHomeMessageHandler: ((event: MessageEvent) => void) | null = null;

export default function DriverHome() {
  const {
    driver,
    activeSubscription,
    isOnline,
    wsConnected,
    setDriver,
    setActiveSubscription,
    setIsOnline,
    setWsConnected,
  } = useDriverStore();
  const { addRideOffer, removeRideOffer, setActiveRideId } = useRideOfferStore();
  const { activeOffer, setActiveOffer, setAcceptedDropoff } =
    useDriverFlowStore();

  const isDark = useIsDark();
  const mapStyleUrl = useBarikoiMapStyle(isDark);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [locationLoading, setLocationLoading] = useState(true);
  // Live hotspot zones for the "Hotspot near you" card — refreshed every 60s.
  const [hotspotZones, setHotspotZones] = useState<HotspotPoint[] | null>(null);

  // When the WS last dropped — drives the "Last connected: X ago" caption
  // under the offline button. Null until the first drop.
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(null);
  const [, setNowTick] = useState(0);
  const [stats, setStats] = useState<DailyStats>({
    earnings_bdt: 0,
    trips: 0,
    online_hours: 0,
    rating: 0,
    acceptance_rate: 0,
  });
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const markerPulseAnim = useRef(new Animated.Value(1)).current;
  const goOnlinePulse = useRef(new Animated.Value(0)).current;
  const radarRings = useRef(
    Array.from({ length: RADAR_RING_COUNT }, () => new Animated.Value(0)),
  ).current;

  // ── Reduce-motion preference ──────────────────────────────────────
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  // Pulsing driver-marker animation on the map
  useEffect(() => {
    if (reduceMotion) {
      markerPulseAnim.stopAnimation();
      markerPulseAnim.setValue(1);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(markerPulseAnim, { toValue: 1.8, duration: 1000, useNativeDriver: true }),
        Animated.timing(markerPulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [markerPulseAnim, reduceMotion]);

  // OFFLINE: pulsing halo behind the "Go Online" circle (2s, gated by reduce-motion)
  useEffect(() => {
    if (reduceMotion || isOnline) {
      goOnlinePulse.stopAnimation();
      goOnlinePulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.parallel([
        Animated.timing(goOnlinePulse, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [goOnlinePulse, isOnline, reduceMotion]);

  // ONLINE: searching radar — 3 rings staggered 500ms, scale 0.5→2, opacity 0.8→0
  useEffect(() => {
    if (reduceMotion || !isOnline) {
      radarRings.forEach((v) => {
        v.stopAnimation();
        v.setValue(0);
      });
      return;
    }
    const loops = radarRings.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 500),
          Animated.parallel([
            Animated.timing(value, { toValue: 1, duration: 2000, useNativeDriver: true }),
          ]),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, reduceMotion]);

  // Immediate GPS request on mount (don't wait for heartbeat interval)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted || cancelled) return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
          setLocationLoading(false);
        }
      } catch (e) {
        if (!cancelled) setLocationLoading(false);
        logger.warn("[driver] initial GPS request failed:", e instanceof Error ? e.message : e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Load driver profile ──────────────────────────────────────────
  const loadDriverProfile = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${API_URL}/api/driver/me`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setDriver(data.driver ?? data);

        // Load active subscription
        const subRes = await fetch(
          `${API_URL}/api/package/active`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (subRes.ok) {
          const subData = await subRes.json();
          setActiveSubscription(subData.subscription);
        }
      }
    } catch {
      // Network error
    }
  }, [setDriver, setActiveSubscription]);

  // ── Daily stats (real endpoint — paisa integers from server) ──────
  const fetchDailyStats = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/daily-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: DailyStats = await res.json();
        setStats(data);
      }
    } catch {
      // Network error — keep last known stats
    }
  }, []);

  // Live demand card: fetch hotspot zones while ONLINE only — the 60s
  // interval pauses when the driver goes offline (battery), and the
  // offline→online transition refetches immediately (mirrors the
  // daily-stats fetch). Non-blocking — a failure leaves the card hidden.
  useEffect(() => {
    if (!isOnline) return;
    let active = true;
    const loadHotspots = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/driver/hotspots`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: {
          hotspots?: {
            name: string;
            lat: number;
            lng: number;
            intensity: number;
            intensity_raw: number;
            demand_count: number;
            supply_count: number;
          }[];
        } = await res.json();
        if (!active) return;
        setHotspotZones(
          (data.hotspots ?? []).filter((h) => h.name && h.lat && h.lng),
        );
      } catch {
        // Network error — card stays hidden until the next tick
      }
    };
    loadHotspots();
    const id = setInterval(loadHotspots, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [isOnline]);

  // Keep the "Last connected" caption fresh (30s tick) while the WS is down.
  useEffect(() => {
    if (wsConnected || !lastOnlineAt) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [wsConnected, lastOnlineAt]);

  // Fetch on mount and whenever we come back ONLINE (offline→online transition)
  useEffect(() => {
    fetchDailyStats();
  }, [fetchDailyStats, isOnline]);

  // ── WebSocket Connection (this screen OWNS the socket + onmessage) ─
  useEffect(() => {
    let ws: WebSocket;
    let reconnectAttempts = 0;

    const handleWsMessage = async (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;

        if (type === "auth:ok") {
          setWsConnected(true);
          await loadDriverProfile();
        } else if (type === "auth:error") {
          logger.warn("[ws] auth error:", msg.message);
        } else if (type === "ride:offer") {
          const pickupAddr = msg.pickup?.address ?? "";
          // Phase D / Stage 2 destination reveal: pre-accept the payload
          // carries ONLY the drop ZONE + heat tag (dropoff_zone). The exact
          // address/coords arrive post-accept via offer:accepted. The legacy
          // ride-offer store gets the zone name as its display string and 0/0
          // coords (never fabricated).
          const dropZoneName = msg.dropoff_zone?.zone_name ?? null;
          addRideOffer({
            id: msg.ride_id,
            fare: msg.fare_breakdown?.total_bdt != null ? String(msg.fare_breakdown.total_bdt) : "",
            duration: "",
            distance: msg.distance_km != null ? String(msg.distance_km) : "",
            pickupDetails: {
              pickup: pickupAddr,
              pickupAddress: pickupAddr,
              pickupDistance: msg.pickup_distance_km ?? 0,
              pickupLongitude: msg.pickup?.lng ?? 0,
              pickupLatitude: msg.pickup?.lat ?? 0,
            },
            dropoffDetails: {
              dropoff: dropZoneName ?? "",
              dropoffAddress: dropZoneName ?? "",
              dropoffLatitude: 0,
              dropoffLongitude: 0,
            },
            customerDetails: {
              full_name: msg.rider_first_name ?? "",
              email: "",
              number: msg.rider_phone ?? "",
            },
            rider_id: msg.rider_id ?? "",
            customer_id: msg.rider_id ?? "",
            status: "pending",
            // Legacy RideOfferDetails shape predates the WS payload — kept as-is
          } as any);
          setActiveOffer({
            ride_id: msg.ride_id,
            pickup: msg.pickup,
            dropoff_zone: {
              zone_id: msg.dropoff_zone?.zone_id ?? null,
              zone_name: dropZoneName,
              // Defensive: old payloads without a heat tag default to neutral.
              heat_tag: msg.dropoff_zone?.heat_tag ?? "neutral",
            },
            fare_breakdown: msg.fare_breakdown,
            driver_fare_bdt: msg.driver_fare_bdt ?? null,
            pickup_fee_estimate_bdt: msg.pickup_fee_estimate_bdt ?? 0,
            lead_cost_calls: msg.lead_cost_calls ?? 1,
            balance_after_calls: msg.balance_after_calls ?? -1,
            vehicle_type: msg.vehicle_type,
            rider_first_name: msg.rider_first_name,
            rider_rating: msg.rider_rating,
            distance_km: msg.distance_km,
            pickup_distance_km: msg.pickup_distance_km,
            pickup_eta_minutes: msg.pickup_eta_minutes,
            is_scheduled: msg.is_scheduled,
            preference_ids: msg.preference_ids,
            expires_in_ms: msg.expires_in_ms,
            expires_at: msg.expires_at,
            upfront_tip_bdt: msg.upfront_tip_bdt ?? 0,
          });
        } else if (type === "lead:billed") {
          // §6 lead economics: the server debited 1 call at OFFER receipt and
          // pushes the authoritative post-debit balance. Apply it to the
          // ledger + driver stores so the wallet stays honest without a refetch.
          if (typeof msg.balance_after_calls === "number") {
            useCallLedgerStore
              .getState()
              .applyLeadBilled(msg.balance_after_calls);
            const sub = useDriverStore.getState().activeSubscription;
            if (sub) {
              useDriverStore
                .getState()
                .setActiveSubscription({
                  ...sub,
                  calls_remaining: msg.balance_after_calls,
                });
            }
          }
        } else if (type === "offer:lost") {
          // Sequential dispatch (Phase D): the chain terminal notification for
          // an offer that ended without this driver's accept. Every reason
          // (expired / cancelled / accepted_elsewhere) closes the card; the
          // lead stays billed in all cases (server-side).
          if (msg.ride_id) removeRideOffer(msg.ride_id);
          setActiveOffer(null);
          const lostToast =
            msg.reason === "cancelled"
              ? "Ride cancelled"
              : msg.reason === "accepted_elsewhere"
                ? "Accepted by another driver"
                : "Offer expired";
          showToast(lostToast, "info");
        } else if (type === "offer:accepted") {
          // Stage 2 reveal: the exact dropoff arrives only now — populate the
          // post-accept state the downstream screens consume.
          if (msg.dropoff?.address != null) {
            setAcceptedDropoff(msg.dropoff);
          }
          setActiveRideId(msg.ride_id);
          setActiveOffer(null);
          router.replace("/(main)/(rider)/find-customer");
        } else if (type === "ride:cancelled" || type === "rider:cancelled") {
          // ride:cancelled (B-7) carries cancelled_by; rider:cancelled is the
          // legacy spelling (treated as rider-initiated). Neither a driver's
          // own cancel nor a system cancel (timeout/admin) is the rider's
          // doing — only rider-initiated cancels get that copy (M-7).
          const cancelledByDriver = msg.cancelled_by === "driver";
          const cancelledBySystem = msg.cancelled_by === "system";
          if (!cancelledByDriver && !cancelledBySystem) {
            Alert.alert("Ride Cancelled", "Rider cancelled the ride");
          }
          if (msg.ride_id) removeRideOffer(msg.ride_id);
          setActiveRideId(null);
          setActiveOffer(null);
          setAcceptedDropoff(null);
          setIsOnline(true);
        }
      } catch {
        // ignore parse errors
      }
    };

    driverHomeMessageHandler = handleWsMessage;

    async function connect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      const userId = session?.user?.id;
      if (!token || !userId) return;

      // Reuse our own authenticated socket if present (e.g. returning Home
      // after a ride) so we never spin up a duplicate connection. H-1:
      // adoption is identity-checked — a socket left in the shared slot by
      // the rider singleton or a previous sign-in/role is torn down and
      // replaced, never adopted.
      const state = useWSStore.getState();
      const existing = state.ws;
      if (
        existing &&
        state.socketRole === "driver" &&
        state.socketUserId === userId &&
        existing.readyState === WebSocket.OPEN
      ) {
        existing.onmessage = (ev) => driverHomeMessageHandler?.(ev);
        setWsConnected(true);
        return;
      }
      if (existing) {
        existing.onopen = null;
        existing.onclose = null;
        existing.onerror = null;
        existing.onmessage = null;
        try {
          existing.close();
        } catch {
          // already closed / closing
        }
        useWSStore.getState().resetWebSocket();
      }

      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        useWSStore.getState().setWebSocket(ws, "driver", userId);
        ws.send(
          JSON.stringify({
            type: "auth:hello",
            access_token: token,
            role: "driver",
          }),
        );
      };

      ws.onmessage = (ev) => driverHomeMessageHandler?.(ev);

      ws.onclose = () => {
        setWsConnected(false);
        setLastOnlineAt(new Date());
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
        const delay =
          Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) +
          Math.random() * 1000;
        reconnectAttempts++;
        reconnectRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    }

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // H-4 + L-a: nulling the indirection detaches EVERY socket this screen
      // ever wired — the live one and any socket a later unmount-scheduled
      // reconnect creates. Intentionally do NOT detach onclose and do NOT
      // close the WebSocket: the socket must persist across navigation
      // (Home -> find-customer -> enter-otp -> finish-ride), and the onclose
      // reconnect keeps the connection alive while the driver is away — the
      // store is identity-tagged on every onopen, so downstream screens
      // re-bind their addEventListener to the new socket and the next
      // driver-home mount re-adopts by role + user id. Sign-out kills the
      // socket itself via authCleanup() -> teardownRiderSocket().
      driverHomeMessageHandler = null;
    };
  }, [
    addRideOffer,
    loadDriverProfile,
    removeRideOffer,
    setActiveOffer,
    setActiveRideId,
    setAcceptedDropoff,
    setIsOnline,
    setWsConnected,
  ]);

  // ── Heartbeat (every 10s when online) ────────────────────────────
  useEffect(() => {
    if (!isOnline) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      // C2: read the socket LIVE from the store, never a per-mount ref.
      // An unmounted mount's orphaned onclose kept rebuilding the socket and
      // writing its own wsRef, so the current mount's ref could point at a
      // dead socket forever — heartbeats silently died while the store (and
      // the green dot) still said connected. The store is updated on every
      // onopen, so it is always the current connection.
      const ws = useWSStore.getState().ws;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) {
          logger.warn("[driver] foreground location permission not granted");
          return;
        }
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setLocation({ lat, lng });
        ws.send(
          JSON.stringify({
            type: "heartbeat",
            lat,
            lng,
            ts: new Date().toISOString(),
          }),
        );
      } catch (e) {
        logger.warn(
          "[driver] heartbeat error:",
          e instanceof Error ? e.message : e,
        );
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 10_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isOnline, wsConnected]);

  // ── Online/Offline Toggle ────────────────────────────────────────
  const toggleOnline = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const newState = !isOnline;
      // N5: never send (0,0) when GPS hasn't fixed yet — the server rejects
      // Null Island when going online, and omitting the coords lets the toggle
      // still work (location gets filled by the next heartbeat).
      const body: Record<string, unknown> = { is_online: newState };
      if (location?.lat != null && location?.lng != null) {
        body.lat = location.lat;
        body.lng = location.lng;
      }
      const res = await fetch(
        `${API_URL}/api/driver/status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );

      if (res.ok) {
        setIsOnline(newState);
      } else {
        const err = await res.json();
        Alert.alert(
          "Cannot go online",
          err.message ?? "Check your subscription status.",
        );
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    }
  };

  // Map dimming: OFFLINE = 30%, RIDE_OFFER = 40%, ONLINE = none
  const dimOpacity = activeOffer ? 0.4 : isOnline ? 0 : 0.3;
  const showReconnectBanner = isOnline && !wsConnected;

  // Nearest live hotspot to the driver's current position (recomputed on
  // every render — the 60s fetch drives updates).
  const nearestZone =
    location && hotspotZones
      ? nearestHotspot(hotspotZones, location.lat, location.lng)
      : null;
  const nearestDistanceKm =
    location && nearestZone
      ? haversineKm(location.lat, location.lng, nearestZone.lat, nearestZone.lng)
      : null;


  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar
        style={isDark ? "light" : "dark"}
        translucent
        backgroundColor="transparent"
      />
      <ScreenLabel screenName="Go Online / Go Offline" screenNumber={1} />

      {/* Live Map */}
      <View style={{ flex: 1 }}>
        {!location ? (
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="location-outline" size={32} color={textSecondary} />
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 16,
                color: textSecondary,
                marginTop: spacing.sm,
              }}
            >
              {locationLoading ? "Getting your location..." : "Location unavailable — enable GPS"}
            </Text>
          </View>
        ) : MapLibreGL && MapLibreGL.MapView ? (
          <MapLibreGL.MapView
            style={{ flex: 1 }}
            mapStyle={mapStyleUrl}
          >
            <MapLibreGL.Camera
              centerCoordinate={[location.lng, location.lat]}
              zoomLevel={16}
            />
            {MapLibreGL.PointAnnotation && (
              <MapLibreGL.PointAnnotation
                id="driver-location"
                coordinate={[location.lng, location.lat]}
              >
                <View style={{ alignItems: "center", justifyContent: "center" }}>
                  <Animated.View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: "rgba(12, 194, 95, 0.2)",
                      transform: [{ scale: markerPulseAnim }],
                      position: "absolute",
                    }}
                  />
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.primary }} />
                </View>
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>
        ) : (
          <View
            style={{
              flex: 1,
              backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 16, color: textSecondary }}>
              Map View
            </Text>
          </View>
        )}

        {/* Map dim overlay (OFFLINE 30% / RIDE_OFFER 40%) */}
        {dimOpacity > 0 && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: colors.black, opacity: dimOpacity }]}
          />
        )}

        {/* ONLINE: searching radar rings */}
        {isOnline && !activeOffer && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {!reduceMotion &&
              radarRings.map((value, i) => (
                <Animated.View
                  key={i}
                  style={{
                    position: "absolute",
                    width: RADAR_RING_SIZE,
                    height: RADAR_RING_SIZE,
                    borderRadius: RADAR_RING_SIZE / 2,
                    borderWidth: 2,
                    borderColor: colors.primary,
                    transform: [
                      {
                        scale: value.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.5, 2],
                        }),
                      },
                    ],
                    opacity: value.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 0],
                    }),
                  }}
                />
              ))}
            <View
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                backgroundColor: colors.primary,
              }}
            />
          </View>
        )}

        {/* OFFLINE: pulsing Go Online circle */}
        {!isOnline && !activeOffer && (
          <View
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <TouchableOpacity
              onPress={toggleOnline}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Go online"
              accessibilityHint="Start receiving ride requests"
              style={{ alignItems: "center", justifyContent: "center" }}
            >
              {!reduceMotion && (
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    width: GO_CIRCLE_SIZE,
                    height: GO_CIRCLE_SIZE,
                    borderRadius: GO_CIRCLE_SIZE / 2,
                    backgroundColor: colors.primary,
                    transform: [
                      {
                        scale: goOnlinePulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.15],
                        }),
                      },
                    ],
                    opacity: goOnlinePulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.6, 0],
                    }),
                  }}
                />
              )}
              <View
                style={{
                  width: GO_CIRCLE_SIZE,
                  height: GO_CIRCLE_SIZE,
                  borderRadius: GO_CIRCLE_SIZE / 2,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons name="power" size={22} color={colors.white} />
                <Text
                  style={{
                    fontFamily: "Jakarta-Bold",
                    fontSize: 12,
                    color: colors.white,
                    marginTop: 2,
                  }}
                >
                  GO ONLINE
                </Text>
              </View>
            </TouchableOpacity>
            {lastOnlineAt && !wsConnected ? (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 14,
                  color: textSecondary,
                  marginTop: spacing.md,
                  textAlign: "center",
                }}
              >
                Last connected: {relativeTime(lastOnlineAt)}
              </Text>
            ) : null}
          </View>
        )}

        {/* Header */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: spacing.sm,
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs + 2,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: wsConnected ? colors.success : colors.danger,
              }}
            />
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 16,
                color: textPrimary,
              }}
              numberOfLines={1}
            >
              {driver?.name ?? "Driver"}
            </Text>
            {driver?.vehicle_type ? (
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary }}>
                · {vehicleTypeDisplay[driver.vehicle_type] ?? driver.vehicle_type}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            {/* WS state chip — live connected/reconnecting indicator. The
                drop is visible here immediately, before/regardless of the
                offline overlay's "Last connected" caption. */}
            <View
              accessibilityLabel={
                wsConnected ? "Connected to server" : "Reconnecting to server"
              }
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                borderRadius: radii.pill,
                paddingHorizontal: spacing.sm + 2,
                paddingVertical: 5,
                backgroundColor: wsConnected
                  ? "rgba(56, 161, 105, 0.12)"
                  : "rgba(245, 158, 11, 0.14)",
              }}
            >
              {wsConnected ? (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: colors.success,
                  }}
                />
              ) : (
                <Ionicons
                  name="cloud-offline-outline"
                  size={12}
                  color={colors.amber}
                />
              )}
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 12,
                  color: wsConnected ? colors.success : colors.amber,
                }}
              >
                {wsConnected ? "Connected" : "Reconnecting…"}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setThemeModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Appearance settings"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: borderColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={isDark ? "moon-outline" : "sunny-outline"}
                size={18}
                color={textPrimary}
              />
            </TouchableOpacity>

            {isOnline ? (
              <TouchableOpacity
                onPress={toggleOnline}
                accessibilityRole="button"
                accessibilityLabel="Go offline"
                style={{
                  borderWidth: 1.5,
                  borderColor: colors.danger,
                  borderRadius: radii.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs + 2,
                  backgroundColor: surfaceBg,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-Bold",
                    fontSize: 14,
                    color: colors.danger,
                  }}
                >
                  Go Offline
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => router.push("/(main)/(rider)/break-mode")}
                accessibilityRole="button"
                accessibilityLabel="Take a break"
                style={{
                  borderWidth: 1.5,
                  borderColor: borderColor,
                  borderRadius: radii.pill,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.xs + 2,
                  backgroundColor: surfaceBg,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-Bold",
                    fontSize: 14,
                    color: textPrimary,
                  }}
                >
                  Take a Break
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Reconnecting banner — WS dropped while ONLINE */}
        {showReconnectBanner && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 60,
              left: spacing.lg,
              right: spacing.lg,
              backgroundColor: colors.amber,
              borderRadius: radii.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.md,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: spacing.sm,
            }}
          >
            <Ionicons name="cloud-offline-outline" size={16} color={colors.black} />
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 16,
                color: colors.black,
              }}
            >
              Reconnecting…
            </Text>
          </View>
        )}

        {/* My Location button */}
        {location && (
          <TouchableOpacity
            onPress={async () => {
              try {
                const loc = await Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                });
                setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude });
              } catch (e) {
                logger.warn("[driver] recenter failed:", e instanceof Error ? e.message : e);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Recenter map on my location"
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: borderColor,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: colors.black,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <Ionicons name="locate" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Bottom: subscription line + stats bar */}
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing.lg,
            gap: spacing.sm,
          }}
        >
          {activeSubscription ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: borderColor,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              }}
            >
              <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: textSecondary }}>
                Calls Remaining
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 18,
                  color: textPrimary,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {activeSubscription.calls_remaining === -1
                  ? "Unlimited"
                  : activeSubscription.calls_remaining}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/(main)/(rider)/packages")}
              accessibilityRole="button"
              accessibilityLabel="Buy a package"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: colors.primary + "40",
                borderRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                alignItems: "center",
              }}
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.primary }}>
                Buy a Package to Start
              </Text>
            </TouchableOpacity>
          )}

          {nearestZone && (
            <TouchableOpacity
              onPress={() => router.push("/(main)/(rider)/hotspot-map")}
              accessibilityRole="button"
              accessibilityLabel={`Hotspot near you: ${nearestZone.name}`}
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: borderColor,
                borderRadius: radii.lg,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm + 4,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.sm,
                  flex: 1,
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: DEMAND_COLOR[demandLevel(nearestZone.intensity_raw)],
                  }}
                />
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 16,
                    color: textPrimary,
                  }}
                >
                  {nearestZone.name}
                </Text>
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 14,
                    color: textSecondary,
                  }}
                >
                  {DEMAND_LABEL[demandLevel(nearestZone.intensity_raw)]}
                </Text>

              </View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Text
                  style={{
                    fontFamily: "Jakarta-Regular",
                    fontSize: 14,
                    color: textSecondary,
                  }}
                >
                  {nearestDistanceKm !== null
                    ? `${nearestDistanceKm.toFixed(1)} km`
                    : ""}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={textSecondary} />
              </View>
            </TouchableOpacity>
          )}

          <DriverStatsBar
            earnings_bdt={stats.earnings_bdt}
            trips={stats.trips}
            online_hours={Math.round(stats.online_hours * 10) / 10}
            onPress={() => router.push("/(main)/(rider)/earnings")}
          />
        </View>
      </View>

      {/* SOS Button — always enabled; offline alerts are queued for retry */}
      <SOSButton />

      {/* Ride Offer Sheet */}
      <RideOfferSheet />

      {/* Appearance toggle */}
      <ReactNativeModal
        isVisible={themeModalVisible}
        onBackdropPress={() => setThemeModalVisible(false)}
        onBackButtonPress={() => setThemeModalVisible(false)}
      >
        <View style={{ width: "91%", alignSelf: "center" }}>
          <ThemeToggle />
        </View>
      </ReactNativeModal>
    </SafeAreaView>
  );
}
