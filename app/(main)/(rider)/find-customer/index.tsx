import { colors, spacing, radii } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, Linking, Alert, ActivityIndicator } from "react-native";
import React, { useEffect, useRef, useState, Fragment } from "react";
import { useRouter } from "expo-router";
import SlideButton from "@/components/SlideButton";
import DriverActionBar from "@/components/DriverActionBar";
import RideInfoCard from "@/components/RideInfoCard";
import ThemeToggle from "@/components/ThemeToggle";
import { useDriver, useRideOfferStore, useWSStore } from "@/store";
import { useSession } from "@/lib/session";
import * as Location from "expo-location";
import { LocationObject } from "expo-location";
import { supabase } from "@/lib/supabase";
import RideLayout from "@/components/RideLayout";
import TollParkingModal from "@/components/TollParkingModal";
import { useIsDark } from "@/lib/useAppearance";
import { Ionicons } from "@expo/vector-icons";
import ReactNativeModal from "react-native-modal";

const ReachCustomer = () => {
  const router = useRouter();
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const {
    userAddress: _userAddress,
    setUserLocation: setDriverLocation,
    setId: _setDriverId,
    setRole: _setDriverRole,
    setFullName: _setDriverFullName,
  } = useDriver();
  const { ws } = useWSStore();
  const { activeRideId, giveRideDetails, removeRideOffer, setActiveRideId } = useRideOfferStore();
  const { user } = useSession();
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [waitLoading, setWaitLoading] = useState(false);
  const waitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showTollModal, setShowTollModal] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [stops, setStops] = useState<any[]>([]);
  const [currentStopIdx, setCurrentStopIdx] = useState(0);

  const toggleWait = async () => {
    if (!activeRideId) return;
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    setWaitLoading(true);
    try {
      if (!waiting) {
        const res = await fetch(`${API_URL}/api/ride/${activeRideId}/wait-start`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { Alert.alert("Error", "Could not start waiting timer"); setWaitLoading(false); return; }
        setWaiting(true);
        setWaitSeconds(0);
        waitIntervalRef.current = setInterval(() => setWaitSeconds((s) => s + 1), 1000);
      } else {
        if (waitIntervalRef.current) clearInterval(waitIntervalRef.current);
        const res = await fetch(`${API_URL}/api/ride/${activeRideId}/wait-end`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setWaiting(false);
        Alert.alert("Waiting Time", `${data.total_wait_minutes ?? 0} min total\nFree: ${data.free_minutes ?? 3} min\nFee: ৳${((data.wait_fee_bdt ?? 0) / 100).toFixed(0)}`);
      }
    } catch { Alert.alert("Error", "Failed to update waiting timer"); }
    setWaitLoading(false);
  };

  useEffect(() => { return () => { if (waitIntervalRef.current) clearInterval(waitIntervalRef.current); }; }, []);

  // Only the driver Home screen creates the WebSocket. If we got here without
  // one the connection is dead — nothing on this screen can work, so send the
  // driver home (Home owns reconnect).
  useEffect(() => {
    if (!ws) {
      Alert.alert("Connection Lost", "You are no longer connected to the server. Returning home.", [
        { text: "OK", onPress: () => router.replace("/(main)/(rider)") },
      ]);
    }
  }, [ws, router]);

  // ── Ride-cancellation handling ─────────────────────────────────────
  // Home owns the socket + its own onmessage, but while the driver is en route
  // to the pickup this screen must react to ride:cancelled / rider:cancelled —
  // otherwise the driver is stuck here after the rider cancels (Home's handler
  // only resets store state, it does not navigate). Use addEventListener (NOT
  // ws.onmessage, which would clobber Home's handler and leave it dead when
  // this screen pops back) and remove the listener on unmount (N4).
  useEffect(() => {
    if (!ws) return;
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;
        if (type === "ride:cancelled" || type === "rider:cancelled") {
          // Driver's own cancel must not raise a "Rider cancelled" alert (N2).
          if (msg.cancelled_by !== "driver") {
            Alert.alert("Ride Cancelled", "Rider cancelled the ride", [
              { text: "OK", onPress: () => router.replace("/(main)/(rider)") },
            ]);
          } else {
            router.replace("/(main)/(rider)");
          }
          if (msg.ride_id) removeRideOffer(msg.ride_id);
          setActiveRideId(null);
        }
      } catch {
        // ignore parse errors
      }
    };
    ws.addEventListener("message", handleWsMessage);
    return () => ws.removeEventListener("message", handleWsMessage);
  }, [ws, router, removeRideOffer, setActiveRideId]);

  // ── Fetch stops on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (!activeRideId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/ride/${activeRideId}/stops`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setStops(data.stops ?? []);
      }
    })();
  }, [activeRideId]);

  const calculateDistance = (
    location1: LocationObject,
    location2: LocationObject,
  ) => {
    const lat1 = location1.coords.latitude;
    const lon1 = location1.coords.longitude;
    const lat2 = location2.coords.latitude;
    const lon2 = location2.coords.longitude;
    const toRad = (value: number) => (value * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000;
  };

  useEffect(() => {
    let locationSubscription: Location.LocationSubscription | null = null;

    const startWatching = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;

      locationSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Highest,
          timeInterval: 10000,
          distanceInterval: 2,
        },
        async (location) => {
          if (lastLocationRef.current) {
            const distance = calculateDistance(
              lastLocationRef.current,
              location,
            );
            if (distance >= 5) {
              const address = await Location.reverseGeocodeAsync({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              });
              if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(
                  JSON.stringify({
                    type: "location:update",
                    ride_id: activeRideId,
                    lat: location.coords.latitude,
                    lng: location.coords.longitude,
                  }),
                );
              }
              setDriverLocation({
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                address: address[0]?.formattedAddress!,
              });
              lastLocationRef.current = location;
            }
          } else {
            lastLocationRef.current = location;
          }
          setDriverLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address:
              (
                await Location.reverseGeocodeAsync({
                  latitude: location.coords.latitude,
                  longitude: location.coords.longitude,
                })
              )[0]?.formattedAddress ?? "",
          });
        },
      );
    };

    if (user) {
      startWatching();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
        locationSubscription = null;
      }
    };
  }, [user]);

  const handleSlideComplete = () => {
    // Tell the server the driver reached the pickup -> ride becomes driver_arrived,
    // the rider is notified, and we move on to the Ride-Pin screen.
    if (ws && ws.readyState === WebSocket.OPEN && activeRideId) {
      ws.send(
        JSON.stringify({
          type: "ride:arrived",
          ride_id: activeRideId,
        }),
      );
    }
    router.replace("/(main)/(rider)/enter-otp");
  };

  const rideDetails = giveRideDetails(activeRideId!);
  const customerPhone = rideDetails?.customerDetails?.number || "";
  const pickupAddress =
    rideDetails?.pickupDetails?.pickupAddress || "Pickup location";
  const destinationAddress =
    rideDetails?.dropoffDetails?.dropoffAddress || "Destination not set";

  const callCustomer = () => {
    if (customerPhone) {
      Linking.openURL(`tel:${customerPhone}`);
    } else {
      Alert.alert("Unavailable", "Phone number not available");
    }
  };

  const openNavigation = () => {
    if (activeRideId) router.push(`/(main)/(rider)/customer-navigation/${activeRideId}`);
  };

  const openChat = () => {
    if (activeRideId) router.push(`/(main)/(rider)/chat/${activeRideId}`);
  };

  return (
    <Fragment>
      <RideLayout disabled={true} title="" snapPoints={["40%", "50%"]}>
      <View style={{ justifyContent: "space-between" }}>
        {/* Heading */}
        <View>
          <Text
            style={{
              fontSize: 20,
              fontFamily: "Jakarta-Bold",
              color: textPrimary,
              marginBottom: spacing["2xl"],
            }}
          >
            Ride Details
          </Text>

          {/* Pickup / Destination */}
          <RideInfoCard
            origin={pickupAddress}
            destination={destinationAddress}
            stop_count={stops.length}
          />
        </View>

        {/* Multi-Stops */}
        {stops.length > 0 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text
              style={{
                fontSize: 14,
                fontFamily: "Jakarta-Bold",
                color: textPrimary,
                marginBottom: spacing.sm,
              }}
            >
              Stops ({currentStopIdx + 1}/{stops.length + 1})
            </Text>
            {stops.map((stop: any, i: number) => {
              const completed = i < currentStopIdx;
              const current = i === currentStopIdx;
              return (
                <View key={stop.id} style={{ paddingVertical: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: current ? "Jakarta-Bold" : "Jakarta-Regular",
                      color: current
                        ? colors.primary
                        : textSecondary,
                      textDecorationLine: completed ? "line-through" : "none",
                    }}
                  >
                    {i + 1}. {stop.address}
                  </Text>
                </View>
              );
            })}
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Jakarta-Regular",
                color: textSecondary,
                marginTop: 4,
              }}
            >
              Final: {destinationAddress}
            </Text>
            {currentStopIdx < stops.length && (
              <TouchableOpacity
                onPress={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  const token = session?.access_token;
                  if (!token) return;
                  const stop = stops[currentStopIdx];
                  const res = await fetch(`${API_URL}/api/ride/${activeRideId}/stops`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ stop_id: stop.id }),
                  });
                  if (res.ok) {
                    setCurrentStopIdx(i => i + 1);
                    Alert.alert('Stop completed', 'Continue to next destination.');
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={`Complete stop ${currentStopIdx + 1}`}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: radii.pill,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing["2xl"],
                  alignItems: "center",
                  marginTop: spacing.md,
                  alignSelf: "flex-start",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                  <Ionicons name="checkmark" size={16} color={colors.white} />
                  <Text
                    style={{
                      color: colors.white,
                      fontFamily: "Jakarta-Bold",
                      fontSize: 15,
                    }}
                  >
                    Complete Stop {currentStopIdx + 1}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Rider actions */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <Text
            style={{
              fontSize: 15,
              fontFamily: "Jakarta-SemiBold",
              color: textPrimary,
              marginBottom: spacing.sm,
            }}
          >
            Need Help?
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: textSecondary,
              fontFamily: "Jakarta-Regular",
              marginBottom: spacing.md,
            }}
          >
            Contact or navigate to your rider
          </Text>
          <DriverActionBar
            onCall={callCustomer}
            onNavigate={openNavigation}
            onChat={openChat}
          />
        </View>

        {/* Slide Button */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <Text
            style={{
              textAlign: "center",
              color: textSecondary,
              fontSize: 13,
              fontFamily: "Jakarta-Regular",
              marginBottom: spacing.md,
            }}
          >
            Slide to confirm once you&apos;ve reached the pickup location
          </Text>
          <SlideButton
            title="Slide to Confirm Arrival"
            onComplete={handleSlideComplete}
            bgColor={colors.slideGreen}
            textColor={colors.white}
          />
          <TouchableOpacity
            onPress={toggleWait}
            disabled={waitLoading}
            accessibilityRole="button"
            accessibilityLabel={waiting ? "Stop waiting timer" : "Start waiting timer"}
            style={{
              marginTop: spacing.md,
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.pill,
              alignItems: "center",
              backgroundColor: waiting ? colors.amber : (isDark ? colors.surfaceElevatedDark : colors.gray600),
            }}
          >
            {waitLoading ? (
              <ActivityIndicator size={16} color={colors.white} />
            ) : (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
                <Ionicons name="timer-outline" size={16} color={colors.white} />
                <Text
                  style={{
                    color: colors.white,
                    fontFamily: "Jakarta-Bold",
                    fontSize: 14,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {waiting
                    ? `${Math.floor(waitSeconds / 60)}:${String(waitSeconds % 60).padStart(2, "0")} — Stop`
                    : "Start Waiting Timer"}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => activeRideId && router.push(`/(main)/(rider)/cancellation-reasons?rideId=${activeRideId}`)}
            accessibilityRole="button"
            accessibilityLabel="Cancel ride"
            style={{ marginTop: spacing.md, alignItems: "center" }}
          >
            <Text style={{ color: colors.danger, fontSize: 14, fontFamily: "Jakarta-Bold" }}>
              Cancel Ride
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowTollModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Add toll or parking charge"
            style={{
              marginTop: spacing.md,
              paddingVertical: spacing.sm,
              paddingHorizontal: spacing.lg,
              borderRadius: radii.pill,
              backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray600,
              alignItems: "center",
              alignSelf: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.xs }}>
              <Ionicons name="receipt-outline" size={16} color={colors.white} />
              <Text style={{ color: colors.white, fontFamily: "Jakarta-Bold", fontSize: 14 }}>
                Add Charge
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </RideLayout>

      {/* Appearance toggle (top-right, beside RideLayout's back button) */}
      <TouchableOpacity
        onPress={() => setThemeModalVisible(true)}
        accessibilityRole="button"
        accessibilityLabel="Appearance settings"
        style={{
          position: "absolute",
          top: 64,
          right: spacing.xl,
          zIndex: 11,
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
          borderWidth: 1,
          borderColor: isDark ? colors.borderDark : colors.borderLight,
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
      <ReactNativeModal
        isVisible={themeModalVisible}
        onBackdropPress={() => setThemeModalVisible(false)}
        onBackButtonPress={() => setThemeModalVisible(false)}
      >
        <View style={{ width: "91%", alignSelf: "center" }}>
          <ThemeToggle />
        </View>
      </ReactNativeModal>

      <TollParkingModal visible={showTollModal} rideId={activeRideId} onClose={() => setShowTollModal(false)} />
    </Fragment>
  );
};

export default ReachCustomer;
