import { colors } from "@/theme/goRide";
import { View, Text, ActivityIndicator, Alert, Dimensions } from "react-native";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import MapLibreGL from "@/utils/maplibreLoader";
import { supabase } from "@/lib/supabase";
import { useRiderStore } from "@/store/useRiderStore";
import { useWSStore } from "@/store";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import CustomButton from "@/components/CustomButton";

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL ?? "";
const MAP_STYLE =
  "https://map.barikoi.com/styles/osm-liberty/style.json?key=" +
  (Constants.expoConfig?.extra?.EXPO_PUBLIC_BARIKOI_API_KEY ?? "");
const { height } = Dimensions.get("window");

export default function FinalPage() {
  const {
    activeRide,
    searchingRideId,
    rideStatus,
    setActiveRide,
    setRideStatus,
    setSearchingRideId,
    clearRoute,
  } = useRiderStore();

  const ws = useWSStore((s) => s.ws);

  const [cancelling, setCancelling] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Driver tracking state (WebSocket-based)
  const [driverLat, setDriverLat] = useState<number | null>(null);
  const [driverLng, setDriverLng] = useState<number | null>(null);
  const [driverEta, setDriverEta] = useState<number | null>(null);
  const wsSubscribedRef = useRef(false);

  const vehicleDef = activeRide?.vehicle_type
    ? VEHICLE_TYPES.find((v) => v.key === (activeRide.vehicle_type as any))
    : null;

  // WebSocket subscription for ride status + driver location updates
  useEffect(() => {
    const rideId = searchingRideId || activeRide?.id;
    if (
      !rideId ||
      rideStatus === "completed" ||
      rideStatus === "cancelled" ||
      rideStatus === "expired"
    ) {
      wsSubscribedRef.current = false;
      return;
    }

    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (wsSubscribedRef.current) return;
    wsSubscribedRef.current = true;

    // Subscribe to ride updates via WebSocket
    ws.send(JSON.stringify({ type: "ride:subscribe", ride_id: rideId }));

    const onMessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.ride_id !== rideId) return;

        switch (msg.type) {
          case "ride:status": {
            if (msg.status) {
              setRideStatus(mapStatus(msg.status));
              if (msg.ride) setActiveRide(msg.ride);
            }
            break;
          }
          case "location:driver": {
            if (msg.lat != null) setDriverLat(msg.lat);
            if (msg.lng != null) setDriverLng(msg.lng);
            if (msg.eta_minutes != null) setDriverEta(msg.eta_minutes);
            break;
          }
        }
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.addEventListener("message", onMessage);

    // Elapsed timer
    const elapsedInt = setInterval(() => setElapsed((p) => p + 1), 1000);

    return () => {
      ws.removeEventListener("message", onMessage);
      ws.send(JSON.stringify({ type: "ride:unsubscribe", ride_id: rideId }));
      wsSubscribedRef.current = false;
      clearInterval(elapsedInt);
    };
  }, [searchingRideId, activeRide?.id, rideStatus, ws]);

  const handleCancel = useCallback(async () => {
    if (!searchingRideId && !activeRide?.id) return;
    const rideId = searchingRideId || activeRide?.id;
    if (!rideId) return;

    setCancelling(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/ride/${rideId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          cancelled_by: "rider",
          reason: "rider_cancelled",
        }),
      });
      if (res.ok) {
        setRideStatus("cancelled");
        setSearchingRideId(null);
      }
    } catch {
      Alert.alert("Error", "Failed to cancel ride");
    } finally {
      setCancelling(false);
    }
  }, [searchingRideId, activeRide?.id]);

  const handleGoHome = () => {
    clearRoute();
    setActiveRide(null);
    setSearchingRideId(null);
    setRideStatus("idle");
    router.replace("/(main)/(customer)/(tabs)/home");
  };

  const renderFinding = () => (
    <View className="flex-1 items-center justify-center px-6">
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="text-xl font-urbanist-bold text-goTextPrimaryLight mt-6">
        Finding your ride...
      </Text>
      <Text className="text-sm font-inter text-gray-500 mt-2 text-center">
        Searching for nearby drivers
      </Text>
      <View className="mt-8 p-4 bg-white rounded-2xl w-full border border-goBorderLight">
        <Text className="text-sm font-inter text-gray-500">Searching for</Text>
        <Text className="text-lg font-urbanist-bold text-goTextPrimaryLight mt-1">
          {vehicleDef?.display_en ?? activeRide?.vehicle_type ?? "Vehicle"}
        </Text>
        <Text className="text-sm font-inter text-gray-400 mt-1">
          Elapsed: {Math.floor(elapsed / 60)}:
          {(elapsed % 60).toString().padStart(2, "0")}
        </Text>
      </View>
      <CustomButton
        title={cancelling ? "Cancelling..." : "Cancel Request"}
        onPress={handleCancel}
        bgVariant="danger"
        disabled={cancelling}
        className="w-full mt-6"
      />
    </View>
  );

  const renderMatched = () => (
    <View className="flex-1 px-4 pt-4">
      {/* Map with driver location pin */}
      <View
        className="w-full rounded-2xl overflow-hidden border border-goBorderLight mb-4"
        style={{ height: height * 0.35 }}
      >
        <MapLibreGL.MapView
          style={{ flex: 1 }}
          styleURL={MAP_STYLE}
          logoEnabled={false}
          attributionEnabled={false}
          scrollEnabled
          pitchEnabled={false}
          rotateEnabled={false}
          {...({} as any)}
        >
          {driverLat != null && driverLng != null && (
            <MapLibreGL.Camera
              centerCoordinate={[driverLng, driverLat]}
              zoomLevel={15}
              animationDuration={500}
            />
          )}
          {/* Driver pin */}
          {driverLat != null && driverLng != null && (
            <MapLibreGL.PointAnnotation
              id="driver-location"
              coordinate={[driverLng, driverLat]}
            >
              <View className="w-10 h-10 rounded-full bg-goAccent/20 items-center justify-center">
                <View className="w-6 h-6 rounded-full bg-goAccent items-center justify-center">
                  <Text className="text-white text-xs">🚗</Text>
                </View>
              </View>
            </MapLibreGL.PointAnnotation>
          )}
          {/* Pickup marker */}
          {activeRide?.origin_latitude != null &&
            activeRide?.origin_longitude != null && (
              <MapLibreGL.PointAnnotation
                id="pickup"
                coordinate={[
                  parseFloat(activeRide.origin_longitude.toString()),
                  parseFloat(activeRide.origin_latitude.toString()),
                ]}
              >
                <View className="w-6 h-6 rounded-full bg-green-500 items-center justify-center">
                  <Text className="text-white text-xs">●</Text>
                </View>
              </MapLibreGL.PointAnnotation>
            )}
        </MapLibreGL.MapView>
        {/* ETA overlay */}
        {driverEta != null && (
          <View className="absolute top-3 left-3 bg-white/90 rounded-full px-3 py-1.5 shadow-sm">
            <Text className="text-sm font-urbanist-bold text-goTextPrimaryLight">
              ETA: {Math.round(driverEta)} min
            </Text>
          </View>
        )}
      </View>

      {/* Driver info card */}
      <View className="p-4 bg-white rounded-2xl border border-goBorderLight">
        <Text className="text-lg font-urbanist-bold text-goTextPrimaryLight">
          {driverEta != null
            ? `Arriving in ${Math.round(driverEta)} min`
            : "Driver Found!"}
        </Text>
        <View className="flex-row items-center mt-3">
          <View className="w-14 h-14 rounded-full bg-goAccent/10 items-center justify-center">
            <Text className="text-2xl text-goAccent font-urbanist-bold">
              {activeRide?.driver?.name?.charAt(0) ?? "D"}
            </Text>
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-base font-urbanist-bold text-goTextPrimaryLight">
              {activeRide?.driver?.name ?? "Driver"}
            </Text>
            <Text className="text-sm font-inter text-gray-500">
              {activeRide?.driver?.vehicle_type
                ? (VEHICLE_TYPES.find(
                    (v) => v.key === (activeRide.driver!.vehicle_type as any),
                  )?.display_en ?? activeRide.driver.vehicle_type)
                : (vehicleDef?.display_en ?? "")}
            </Text>
          </View>
          <View className="items-end">
            <Text className="text-lg font-urbanist-bold text-goAccent">
              ৳
              {activeRide?.fare_breakdown?.total_bdt
                ? (Number(activeRide.fare_breakdown.total_bdt) / 100).toFixed(0)
                : "—"}
            </Text>
            <Text className="text-xs font-inter text-gray-400">Est. Fare</Text>
          </View>
        </View>
      </View>

      {/* Trip info */}
      <View className="mt-4 p-4 bg-white rounded-2xl border border-goBorderLight">
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-goAccent/10 items-center justify-center">
            <Text className="text-goAccent text-xs">●</Text>
          </View>
          <Text
            className="ml-3 text-sm font-inter text-goTextPrimaryLight flex-1"
            numberOfLines={1}
          >
            {activeRide?.origin_address ?? "Pickup"}
          </Text>
        </View>
        <View className="h-4 w-0.5 bg-gray-300 ml-4" />
        <View className="flex-row items-center">
          <View className="w-8 h-8 rounded-full bg-goDanger/10 items-center justify-center">
            <Text className="text-goDanger text-xs">■</Text>
          </View>
          <Text
            className="ml-3 text-sm font-inter text-goTextPrimaryLight flex-1"
            numberOfLines={1}
          >
            {activeRide?.destination_address ?? "Dropoff"}
          </Text>
        </View>
      </View>
    </View>
  );

  const renderCompleted = () => (
    <View className="flex-1 items-center justify-center px-6">
      <View className="w-20 h-20 rounded-full bg-goAccent/10 items-center justify-center mb-4">
        <Text className="text-4xl text-goAccent">✓</Text>
      </View>
      <Text className="text-2xl font-urbanist-bold text-goTextPrimaryLight">
        Ride Complete!
      </Text>
      <View className="mt-6 p-4 bg-white rounded-2xl w-full border border-goBorderLight">
        <View className="flex-row justify-between">
          <Text className="text-sm font-inter text-gray-500">Total Fare</Text>
          <Text className="text-lg font-urbanist-bold text-goAccent">
            ৳
            {activeRide?.fare_breakdown?.total_bdt
              ? (Number(activeRide.fare_breakdown.total_bdt) / 100).toFixed(0)
              : "—"}
          </Text>
        </View>
      </View>
      <CustomButton
        title="Back to Home"
        onPress={handleGoHome}
        className="w-full mt-6"
      />
    </View>
  );

  const renderError = () => (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-4xl mb-4">😔</Text>
      <Text className="text-xl font-urbanist-bold text-goTextPrimaryLight text-center">
        No drivers available
      </Text>
      <Text className="text-sm font-inter text-gray-500 mt-2 text-center">
        Please try again later
      </Text>
      <CustomButton
        title="Back to Home"
        onPress={handleGoHome}
        className="w-full mt-6"
      />
    </View>
  );

  const renderState = () => {
    switch (rideStatus) {
      case "finding":
        return renderFinding();
      case "matched":
      case "arriving":
      case "in_progress":
        return renderMatched();
      case "completed":
        return renderCompleted();
      case "cancelled":
      case "expired":
        return renderError();
      default:
        return (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight">
      <View className="flex-1">{renderState()}</View>
    </SafeAreaView>
  );
}

function mapStatus(
  dbStatus: string,
):
  | "finding"
  | "arriving"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "expired"
  | "idle" {
  switch (dbStatus) {
    case "pending":
    case "dispatching":
      return "finding";
    case "matched":
    case "driver_arriving":
      return "arriving";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "expired":
    case "no_drivers":
      return "expired";
    default:
      return "idle";
  }
}
