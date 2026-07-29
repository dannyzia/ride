import { View, Text, TouchableOpacity, Alert, TextInput, Modal } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { useDriverStore } from "@/store/useDriverStore";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useRideOfferStore, useWSStore } from "@/store";
import CustomButton from "@/components/CustomButton";
import SOSButton from "@/components/SOSButton";
import RideOfferSheet from "@/components/RideOfferSheet";
import { colors } from "@/theme/goRide";
import MapLibreGL from "@/utils/maplibreLoader";
import { useBarikoiMapStyle, DEFAULT_COORDINATES } from "@/utils/mapUtils";
import { logger } from "@/lib/logger";

const WS_URL =
  process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "ws://localhost:3001";

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
  const { setActiveOffer } = useDriverFlowStore();

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectRef = useRef<NodeJS.Timeout | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const mapStyleUrl = useBarikoiMapStyle(false);

  const [earningsToday, setEarningsToday] = useState(0);
  const [goal, setGoal] = useState(100000);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalInput, setGoalInput] = useState("1000");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/earnings/breakdown`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) { const data = await res.json(); setEarningsToday(data.earnings_today_bdt ?? data.today_bdt ?? 0); }
        }
      } catch {}
      const saved = await AsyncStorage.getItem('earnings_goal');
      if (saved) setGoal(parseInt(saved, 10));
    })();
  }, []);

  const saveGoal = async () => {
    const v = parseInt(goalInput, 10) * 100;
    if (v > 0) { setGoal(v); await AsyncStorage.setItem('earnings_goal', String(v)); }
    setGoalModalVisible(false);
  };

  // ── WebSocket Connection ──────────────────────────────────────────
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
          const dropoffAddr = msg.dropoff?.address ?? "";
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
              dropoff: dropoffAddr,
              dropoffAddress: dropoffAddr,
              dropoffLatitude: msg.dropoff?.lat ?? 0,
              dropoffLongitude: msg.dropoff?.lng ?? 0,
            },
            customerDetails: {
              full_name: msg.rider_first_name ?? "",
              email: "",
              number: msg.rider_phone ?? "",
            },
            rider_id: msg.rider_id ?? "",
            customer_id: msg.rider_id ?? "",
            status: "pending",
          } as any);
          setActiveOffer({
            ride_id: msg.ride_id,
            pickup: msg.pickup,
            dropoff: msg.dropoff,
            fare_breakdown: msg.fare_breakdown,
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
        } else if (type === "offer:lost" || type === "offer:expired") {
          removeRideOffer(msg.ride_id);
          setActiveOffer(null);
        } else if (type === "offer:accepted") {
          setActiveRideId(msg.ride_id);
          setActiveOffer(null);
          router.replace("/(main)/(rider)/find-customer");
        } else if (type === "subscription:expired") {
          setActiveSubscription(null);
        } else if (type === "admin:suspended") {
          Alert.alert(
            "Suspended",
            msg.reason ?? "Your account has been suspended.",
          );
          setIsOnline(false);
        }
      } catch (_e) {
        // ignore parse errors
      }
    };

    // Reuse an existing open socket if present (e.g. returning Home after a
    // ride) so we never spin up a duplicate connection.
    const existing = useWSStore.getState().ws;
    if (existing && existing.readyState === WebSocket.OPEN) {
      wsRef.current = existing;
      existing.onmessage = handleWsMessage;
      return;
    }

    async function connect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        useWSStore.getState().setWebSocket(ws);
        ws.send(
          JSON.stringify({
            type: "auth:hello",
            access_token: token,
            role: "driver",
          }),
        );
      };

      ws.onmessage = handleWsMessage;

      ws.onclose = () => {
        setWsConnected(false);
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

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      // Intentionally do NOT close the WebSocket here. The driver socket must
      // persist across navigation (Home -> find-customer -> enter-otp ->
      // finish-ride) so every screen shares one authenticated connection.
      // Closing it on unmount left downstream screens with a dead socket, so
      // ride:arrived / ride:start were silently dropped.
    };
  }, []);

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
      const ws = wsRef.current;
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

  // ── Load driver profile ──────────────────────────────────────────
  const loadDriverProfile = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/api/driver/me`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setDriver(data.driver ?? data);

        // Load active subscription
        const subRes = await fetch(
          `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/api/package/active`,
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
  }, []);

  // ── Online/Offline Toggle ────────────────────────────────────────
  const toggleOnline = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const newState = !isOnline;
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SERVER_URL ?? ""}/api/driver/status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            is_online: newState,
            lat: location?.lat ?? 0,
            lng: location?.lng ?? 0,
          }),
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

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-goBgLight">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-lg font-JakartaBold text-goTextPrimaryLight">
            {driver?.name ?? "Driver"}
          </Text>
          <Text className="text-sm text-goTextSecondaryLight font-Jakarta">
            {driver?.vehicle_type ?? ""}
          </Text>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => router.push("/(main)/(rider)/incentives")}
          >
            <MaterialIcons
              name="card-giftcard"
              size={22}
              color={colors.primary}
            />
          </TouchableOpacity>
          <View
            className={`w-2 h-2 rounded-full mr-2 ${wsConnected ? "bg-goAccent" : "bg-goDanger"}`}
          />
          <Text className="text-xs text-goTextSecondaryLight">
            {wsConnected ? "Connected" : "Offline"}
          </Text>
        </View>
      </View>

      {/* Earnings Goal Progress Bar */}
      <TouchableOpacity className="mx-4 mt-2 mb-2 p-3 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-[10px] border border-goBorderLight dark:border-goBorderDark" onPress={() => { setGoalInput(String(goal / 100)); setGoalModalVisible(true); }}>
        <View className="flex-row justify-between items-center mb-1.5">
          <Text className="text-[11px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Today's Earnings Goal</Text>
          <Text className="text-[11px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">৳{(earningsToday / 100).toFixed(0)} / ৳{(goal / 100).toFixed(0)}</Text>
        </View>
        <View className="h-1.5 bg-goBorderLight dark:bg-goBorderDark rounded-full overflow-hidden">
          <View className="h-full bg-goAccent rounded-full" style={{ width: `${Math.min(100, goal > 0 ? (earningsToday / goal) * 100 : 0)}%` as any }} />
        </View>
        <Text className="text-[10px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1 text-right">Tap to set goal</Text>
      </TouchableOpacity>

      <Modal visible={goalModalVisible} transparent animationType="fade" onRequestClose={() => setGoalModalVisible(false)}>
        <View className="flex-1 items-center justify-center px-6 bg-black/50">
          <View className="w-full bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-2xl shadow-go-sm p-6">
            <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3">Set Daily Goal (BDT)</Text>
            <TextInput className="bg-goBgLight dark:bg-goBgDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base mb-4" keyboardType="numeric" value={goalInput} onChangeText={setGoalInput} />
            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 py-3 rounded-full border border-goBorderLight dark:border-goBorderDark items-center" onPress={() => setGoalModalVisible(false)}><Text className="font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text></TouchableOpacity>
              <TouchableOpacity className="flex-1 py-3 rounded-full bg-goAccent items-center" onPress={saveGoal}><Text className="font-JakartaBold text-goWhite">Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Live Map */}
      <View className="flex-1 mx-4 rounded-2xl overflow-hidden">
        {MapLibreGL && MapLibreGL.MapView ? (
          <MapLibreGL.MapView
            style={{ flex: 1 }}
            styleURL={mapStyleUrl}
            centerCoordinate={
              location
                ? [location.lng, location.lat]
                : [DEFAULT_COORDINATES.longitude, DEFAULT_COORDINATES.latitude]
            }
            zoomLevel={15}
          >
            {location && MapLibreGL.PointAnnotation && (
              <MapLibreGL.PointAnnotation
                id="driver-location"
                coordinate={[location.lng, location.lat]}
              >
                <View className="w-4 h-4 rounded-full bg-goAccent" />
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>
        ) : (
          <View className="flex-1 bg-goGray100 items-center justify-center rounded-2xl">
            <Text className="text-goTextSecondaryLight font-Jakarta">
              Map View
            </Text>
          </View>
        )}
      </View>

      {/* Wallet Card */}
      {activeSubscription && (
        <View className="mx-4 mt-4 p-4 bg-goSurfaceLight rounded-2xl shadow-sm border border-goBorderLight">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight">
              Calls Remaining
            </Text>
            <Text className="text-lg font-JakartaBold text-goTextPrimaryLight">
              {activeSubscription.calls_remaining === -1
                ? "Unlimited"
                : activeSubscription.calls_remaining}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mt-2">
            <Text className="text-sm font-Jakarta text-goTextSecondaryLight">
              Today
            </Text>
            <Text className="text-sm font-Jakarta text-goTextPrimaryLight">
              {activeSubscription.daily_calls_used} used
            </Text>
          </View>
          {activeSubscription.expires_at && (
            <Text className="text-xs font-Jakarta text-goTextSecondaryLight mt-2">
              Expires:{" "}
              {new Date(activeSubscription.expires_at).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}

      {/* Buy Package */}
      {!activeSubscription && (
        <TouchableOpacity
          onPress={() => router.push("/(main)/(rider)/packages")}
          className="mx-4 mt-4 p-4 bg-goSurfaceLight rounded-2xl shadow-go-sm border border-goBorderLight items-center"
        >
          <Text className="text-goAccent font-JakartaBold">
            Buy a Package to Start
          </Text>
        </TouchableOpacity>
      )}

      {/* Online/Offline Button */}
      <View className="px-4 py-4">
        <CustomButton
          title={isOnline ? "Go Offline" : "Go Online"}
          onPress={toggleOnline}
          bgVariant={isOnline ? "danger" : "primary"}
        />
      </View>

      {/* SOS Button */}
      <SOSButton disabled={!isOnline} />

      {/* Ride Offer Sheet */}
      <RideOfferSheet />
    </SafeAreaView>
  );
}
