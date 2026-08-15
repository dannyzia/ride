import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle } from "@/utils/mapUtils";
import { useWSStore } from "@/store";
import { API_URL } from "@/lib/config";
import { ensureRiderSocket, subscribeRiderSocket, unsubscribeRiderSocket } from "@/lib/riderSocket";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import SOSButton from "@/components/SOSButton";

let MapViewLib: any = MapLibreGL.MapView ?? MapLibreGL.default ?? null;
let PointAnnotation: any = MapLibreGL.PointAnnotation ?? null;
let Camera: any = MapLibreGL.Camera ?? null;
let ShapeSource: any = MapLibreGL.ShapeSource ?? null;
let LineLayer: any = MapLibreGL.LineLayer ?? null;

type TrackingState = "en_route" | "arrived" | "in_progress" | "complete";

interface DriverInfo {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  rating: number;
  total_trips: number;
  avatar_url: string | null;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_plate: string;
  vehicle_type: string;
}

interface RideDetails {
  id: string;
  pickup_address: string;
  destination_address: string;
  pickup_lat: number;
  pickup_lng: number;
  destination_lat: number;
  destination_lng: number;
  fare_bdt: number;
  status: string;
  otp: string;
  created_at: string;
}

export default function RideTrackingScreen() {
  const { ride_id } = useLocalSearchParams<{ ride_id: string }>();
  const [trackingState, setTrackingState] = useState<TrackingState>("en_route");
  const [ride, setRide] = useState<RideDetails | null>(null);
  const [driver, setDriver] = useState<DriverInfo | null>(null);
  const [driverLocation, setDriverLocation] = useState({ lat: 0, lng: 0 });
  const [etaMinutes, setEtaMinutes] = useState(5);
  const [tripSeconds, setTripSeconds] = useState(0);
  const [loading, setLoading] = useState(true);
  const tripTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ws = useWSStore((s) => s.ws);
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const mapStyleURL = useBarikoiMapStyle(isDark);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const fetchRideDetails = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${API_URL}/api/ride/${ride_id}`, {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch ride");
      const data = await res.json();
      setRide(data.ride);
      setDriver(data.driver);
      setTrackingState(mapStatusToTracking(data.ride.status));
      setEtaMinutes(data.ride.eta_minutes || 5);
      if (data.ride.driver_lat && data.ride.driver_lng) {
        setDriverLocation({ lat: data.ride.driver_lat, lng: data.ride.driver_lng });
      }
    } catch (e) {
      logger.error("[tracking] fetch ride failed", e);
      Alert.alert("Error", "Could not load ride details.");
    } finally {
      setLoading(false);
    }
  }, [ride_id]);

  useEffect(() => {
    fetchRideDetails();
  }, [fetchRideDetails]);

  const mapStatusToTracking = (status: string): TrackingState => {
    switch (status) {
      case "driver_assigned":
      case "driver_en_route":
        return "en_route";
      case "driver_arrived":
        return "arrived";
      case "ride_started":
      case "in_progress":
        return "in_progress";
      case "completed":
      case "done":
        return "complete";
      default:
        return "en_route";
    }
  };

  useEffect(() => {
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.ride_id !== ride_id) return;
        switch (msg.type) {
          // Server protocol (utils-server/types.ts): riders receive
          // location:driver, ride:status, ride:arrived, ride:complete.
          case "location:driver":
            setDriverLocation({ lat: msg.lat, lng: msg.lng });
            if (typeof msg.eta_minutes === "number" && msg.eta_minutes > 0) {
              setEtaMinutes(Math.round(msg.eta_minutes));
            }
            break;
          case "ride:status":
            if (msg.status === "driver_arrived") setTrackingState("arrived");
            else if (msg.status === "in_progress") setTrackingState("in_progress");
            else if (msg.status === "completed") setTrackingState("complete");
            else if (msg.status === "cancelled") {
              Alert.alert("Ride Cancelled", "The ride was cancelled");
              router.replace("/(main)/(customer)/(tabs)/home");
            }
            break;
          case "ride:arrived":
            setTrackingState("arrived");
            break;
          case "ride:started":
            setTrackingState("in_progress");
            break;
          case "ride:completed":
          case "ride:complete":
            setTrackingState("complete");
            break;
          case "ride:cancelled":
            Alert.alert("Ride Cancelled", "The ride was cancelled");
            router.replace("/(main)/(customer)/(tabs)/home");
            break;
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, ride_id]);

  // ── Ride subscription (L8: socket is a session singleton) ──────────
  // The rider socket lives in lib/riderSocket.ts (opened once per session at
  // services-hub) and is stored in useWSStore. This screen only subscribes and
  // unsubscribes; the server then forwards location:driver / ride:status /
  // ride:arrived / ride:complete events to that socket. Depends on the store
  // socket so a reconnect (new socket object) re-attaches the auth:ok handler.
  useEffect(() => {
    let disposed = false;
    let attached: WebSocket | null = null;

    const onAuthOk = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        // The server only honors ride:subscribe after auth:ok, so re-send it
        // once auth completes (also covers reconnect + deep links).
        if (msg.type === "auth:ok" && msg.role === "rider") {
          subscribeRiderSocket(ride_id);
        }
      } catch {
        // ignore
      }
    };

    const attach = (socket: WebSocket | null) => {
      if (!socket || disposed) return;
      attached = socket;
      socket.addEventListener("message", onAuthOk);
      // Session socket already up and authed — subscribe immediately.
      if (socket.readyState === WebSocket.OPEN) subscribeRiderSocket(ride_id);
    };

    ensureRiderSocket().then(attach);

    return () => {
      disposed = true;
      if (attached) attached.removeEventListener("message", onAuthOk);
      unsubscribeRiderSocket(ride_id);
    };
  }, [ride_id, ws]);

  useEffect(() => {
    if (trackingState === "in_progress") {
      tripTimerRef.current = setInterval(() => {
        setTripSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
    }
    return () => {
      if (tripTimerRef.current) clearInterval(tripTimerRef.current);
    };
  }, [trackingState]);

  const formatTripTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleCancel = () => {
    Alert.alert(
      "Cancel Ride?",
      trackingState === "en_route"
        ? "A cancellation fee may apply."
        : "You may be charged a no-show fee.",
      [
        { text: "Keep Ride", style: "cancel" },
        {
          text: "Cancel Ride",
          style: "destructive",
            onPress: async () => {
              try {
                const { data: { session } } = await supabase.auth.getSession();
                const token = session?.access_token;
                const res = await fetch(`${API_URL}/api/ride/${ride_id}/cancel`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({}),
                });
              if (res.ok) {
                router.replace("/(main)/(customer)/(tabs)/home");
              } else {
                const err = await res.json().catch(() => ({}));
                Alert.alert("Error", err.error || "Could not cancel ride.");
              }
            } catch {
              Alert.alert("Error", "Network error. Please try again.");
            }
          },
        },
      ]
    );
  };

  const handleShare = async () => {
    try {
      const message = `I'm on a ride with Ride. Track me live: ${API_URL}/track/${ride_id}`;
      await Share.share({ message });
    } catch {
      logger.warn("[tracking] share failed");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg, justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textSecondary }]}>Loading ride details...</Text>
      </SafeAreaView>
    );
  }

  if (!ride || !driver) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg, justifyContent: "center", alignItems: "center" }]}>
        <Ionicons name="alert-circle" size={48} color={colors.danger} />
        <Text style={[styles.loadingText, { color: textSecondary }]}>Ride not found</Text>
        <TouchableOpacity
          style={[styles.backHomeBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
        >
          <Text style={styles.backHomeText}>Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const mapCenter = trackingState === "en_route" || trackingState === "arrived"
    ? [ride.pickup_lng, ride.pickup_lat]
    : [(ride.pickup_lng + ride.destination_lng) / 2, (ride.pickup_lat + ride.destination_lat) / 2];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar translucent backgroundColor="transparent" barStyle={isDark ? "light-content" : "dark-content"} />
      {/* Map Layer */}
      <View style={StyleSheet.absoluteFill}>
        {MapViewLib ? (
          <MapViewLib
            style={{ width: "100%", height: "100%" }}
            styleURL={mapStyleURL}
            centerCoordinate={mapCenter}
            zoomLevel={14}
          >
            {Camera && <Camera zoomLevel={14} centerCoordinate={mapCenter} />}
            {PointAnnotation && (
              <PointAnnotation id="pickup" coordinate={[ride.pickup_lng, ride.pickup_lat]}>
                <View style={[styles.mapPin, { backgroundColor: colors.primary }]} />
              </PointAnnotation>
            )}
            {PointAnnotation && (
              <PointAnnotation id="destination" coordinate={[ride.destination_lng, ride.destination_lat]}>
                <View style={[styles.mapPin, { backgroundColor: colors.danger }]} />
              </PointAnnotation>
            )}
            {driverLocation.lat !== 0 && PointAnnotation && (
              <PointAnnotation id="driver" coordinate={[driverLocation.lng, driverLocation.lat]}>
                <View style={[styles.driverPin, { backgroundColor: colors.info }]}>
                  <Ionicons name="car" size={14} color={colors.white} />
                </View>
              </PointAnnotation>
            )}
            {ShapeSource && LineLayer && (
              <ShapeSource
                id="route"
                shape={{
                  type: "LineString",
                  coordinates: [
                    [ride.pickup_lng, ride.pickup_lat],
                    [ride.destination_lng, ride.destination_lat],
                  ],
                }}
              >
                <LineLayer
                  id="routeLine"
                  style={{ lineColor: colors.primary, lineWidth: 4, lineCap: "round", lineJoin: "round" }}
                />
              </ShapeSource>
            )}
          </MapViewLib>
        ) : (
          <View style={[styles.mapFallback, { backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100 }]}>
            <Text style={{ color: textSecondary }}>Map unavailable</Text>
          </View>
        )}
      </View>

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: surfaceBg, borderColor: borderColor }]}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <View style={[styles.statusBadge, {
          backgroundColor: trackingState === "en_route" ? colors.primaryLight
            : trackingState === "arrived" ? colors.amber + "20"
            : trackingState === "in_progress" ? colors.info + "20"
            : colors.primaryLight
        }]}>
          <Text style={[styles.statusText, {
            color: trackingState === "en_route" ? colors.primary
              : trackingState === "arrived" ? colors.amber
              : trackingState === "in_progress" ? colors.info
              : colors.primary
          }]}>
            {trackingState === "en_route" ? "Driver en route" : trackingState === "arrived" ? "Driver arrived" : trackingState === "in_progress" ? "On trip" : "Complete"}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: surfaceBg, borderColor: borderColor }]}
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={22} color={textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: surfaceBg, borderColor: borderColor }]}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={22} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {/* SOS Button */}
      <SOSButton />

      {/* Bottom Card */}
      <View style={[styles.bottomCard, { backgroundColor: surfaceBg, borderColor: borderColor }]}>
        {/* Drag handle */}
        <View style={[styles.handle, { backgroundColor: borderColor }]} />

        {/* ── EN ROUTE / ARRIVED ── */}
        {(trackingState === "en_route" || trackingState === "arrived") && (
          <>
            <View style={styles.driverRow}>
              <View style={[styles.driverAvatar, { backgroundColor: colors.primary + "20" }]}>
                {driver.avatar_url ? (
                  <Image source={{ uri: driver.avatar_url }} style={styles.avatarImg} />
                ) : (
                  <Text style={[styles.avatarInitial, { color: colors.primary }]}>
                    {driver.first_name?.[0]?.toUpperCase() || "D"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.driverName, { color: textPrimary }]}>{driver.full_name}</Text>
                <View style={styles.ratingRow}>
                  <Ionicons name="star" size={14} color={colors.amber} />
                  <Text style={[styles.ratingText, { color: textSecondary }]}>{driver.rating.toFixed(1)}</Text>
                  <Text style={[styles.tripsText, { color: textDisabled }]}>· {driver.total_trips} trips</Text>
                </View>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.etaText, { color: colors.primary }]}>
                  {trackingState === "arrived" ? "Arrived" : `${etaMinutes} min`}
                </Text>
                <Text style={[styles.etaSub, { color: textSecondary }]}>away</Text>
              </View>
            </View>

            <View style={[styles.vehicleRow, { borderColor: borderColor }]}>
              <Ionicons name="car" size={20} color={textSecondary} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.vehicleText, { color: textPrimary }]}>
                  {driver.vehicle_color} {driver.vehicle_model}
                </Text>
                <Text style={[styles.plateText, { color: textSecondary }]}>{driver.vehicle_plate}</Text>
              </View>
              <View style={[styles.vehicleTypeBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.vehicleTypeText, { color: colors.primary }]}>{driver.vehicle_type}</Text>
              </View>
            </View>

            <View style={[styles.addressRow, { borderColor: borderColor }]}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.addressText, { color: textPrimary }]} numberOfLines={2}>{ride.pickup_address}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={() => {}}>
                <Ionicons name="call" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: textPrimary }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={() => router.push(`/(main)/(customer)/chat/${ride_id}`)}>
                <Ionicons name="chatbubble" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: textPrimary }]}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={handleCancel}>
                <Ionicons name="close-circle" size={20} color={colors.danger} />
                <Text style={[styles.actionBtnText, { color: colors.danger }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── ARRIVED: OTP HINT ── */}
        {trackingState === "arrived" && (
          <View style={[styles.otpBanner, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="lock-closed" size={18} color={colors.primary} />
            <Text style={[styles.otpText, { color: colors.primary }]}>
              Share PIN <Text style={{ fontFamily: "Jakarta-Bold" }}>{ride.otp}</Text> with driver
            </Text>
          </View>
        )}

        {/* ── IN PROGRESS ── */}
        {trackingState === "in_progress" && (
          <>
            <View style={styles.tripHeader}>
              <View>
                <Text style={[styles.tripTimer, { color: textPrimary }]}>{formatTripTime(tripSeconds)}</Text>
                <Text style={[styles.tripLabel, { color: textSecondary }]}>Trip time</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[styles.farePreview, { color: textPrimary }]}>৳{(ride.fare_bdt / 100).toFixed(0)}</Text>
                <Text style={[styles.tripLabel, { color: textSecondary }]}>Estimated fare</Text>
              </View>
            </View>

            <View style={[styles.addressRow, { borderColor: borderColor }]}>
              <View style={[styles.dot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.addressText, { color: textPrimary }]} numberOfLines={2}>{ride.destination_address}</Text>
            </View>

            <View style={styles.actionRow}>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={() => {}}>
                <Ionicons name="call" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: textPrimary }]}>Call</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={() => router.push(`/(main)/(customer)/chat/${ride_id}`)}>
                <Ionicons name="chatbubble" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: textPrimary }]}>Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 }]} onPress={handleShare}>
                <Ionicons name="share" size={20} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: textPrimary }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── COMPLETE: FARE + RATE DRIVER ── */}
        {trackingState === "complete" && (
          <View style={[styles.completeContainer, { backgroundColor: surfaceBg }]}>
            <Text style={[styles.completeTitle, { color: textPrimary }]}>Ride Complete</Text>

            <View style={[styles.fareCard, { borderColor: borderColor }]}>
              <Text style={[styles.fareAmount, { color: colors.primary }]}>
                ৳{(ride.fare_bdt / 100).toFixed(0)}
              </Text>
              <Text style={[styles.fareLabel, { color: textSecondary }]}>
                Pay driver in cash
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.rateDriverBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/(main)/(customer)/rate-driver?rideId=${ride_id}`)}
            >
              <Text style={styles.rateDriverBtnText}>Rate Your Driver</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingText: { fontFamily: "Jakarta-Regular", fontSize: 14, marginTop: 12 },
  backHomeBtn: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 100 },
  backHomeText: { fontFamily: "Jakarta-Bold", fontSize: 15, color: colors.white },
  mapFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  mapPin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: colors.white,
  },
  driverPin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.white,
  },
  topBar: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 100,
  },
  statusText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  bottomCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    overflow: "hidden",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarInitial: { fontFamily: "Jakarta-Bold", fontSize: 22 },
  driverName: { fontFamily: "Jakarta-Bold", fontSize: 18 },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 4, gap: 4 },
  ratingText: { fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  tripsText: { fontFamily: "Jakarta-Regular", fontSize: 13 },
  etaText: { fontFamily: "Jakarta-Bold", fontSize: 22 },
  etaSub: { fontFamily: "Jakarta-Regular", fontSize: 12, marginTop: 2 },
  vehicleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    marginBottom: 12,
  },
  vehicleText: { fontFamily: "Jakarta-SemiBold", fontSize: 15 },
  plateText: { fontFamily: "Jakarta-Regular", fontSize: 13, marginTop: 2 },
  vehicleTypeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  vehicleTypeText: { fontFamily: "Jakarta-Bold", fontSize: 11 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  addressText: { fontFamily: "Jakarta-SemiBold", fontSize: 14, flex: 1 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  actionBtnText: { fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  otpBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  otpText: { fontFamily: "Jakarta-SemiBold", fontSize: 14 },
  tripHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  tripTimer: { fontFamily: "Jakarta-Bold", fontSize: 32 },
  tripLabel: { fontFamily: "Jakarta-Regular", fontSize: 13, marginTop: 2 },
  farePreview: { fontFamily: "Jakarta-Bold", fontSize: 24 },
  driverSummary: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    marginBottom: 16,
    gap: 14,
  },
  rateLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    marginBottom: 12,
    textAlign: "center",
  },
  completeContainer: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 20,
  },
  completeTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
    textAlign: "center",
    marginBottom: 8,
  },
  fareCard: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 32,
    borderRadius: 16,
    borderWidth: 1,
    width: "100%",
    gap: 4,
  },
  fareAmount: {
    fontFamily: "Jakarta-Bold",
    fontSize: 42,
  },
  fareLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  rateDriverBtn: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 100,
    alignItems: "center",
  },
  rateDriverBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    color: colors.white,
  },
});
