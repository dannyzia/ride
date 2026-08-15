import { colors, spacing, radii } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { SuccessCheckmark } from "@/components/SuccessCheckmark";
import TollParkingModal from "@/components/TollParkingModal";
import DriverActionBar from "@/components/DriverActionBar";
import RideInfoCard from "@/components/RideInfoCard";
import ThemeToggle from "@/components/ThemeToggle";
import {
  View,
  Text,
  Alert,
  TouchableOpacity,
  Linking,
  TextStyle,
} from "react-native";
import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "expo-router";
import SlideButton from "@/components/SlideButton";
import { useDriver, useRideOfferStore, useWSStore } from "@/store";
import * as Location from "expo-location";
import { LocationObject } from "expo-location";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import ReactNativeModal from "react-native-modal";
import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { useIsDark } from "@/lib/useAppearance";
import { Ionicons } from "@expo/vector-icons";

interface CompletionSummary {
  total_bdt: number;
  distance_km: number | null;
  ride_time_min: number | null;
  upfront_tip_forfeited_bdt?: number;
  rider_payable_bdt?: number;
  wallet_debit_bdt?: number;
}

const FinishRide = () => {
  const router = useRouter();
  const { user } = useSession();
  const isDark = useIsDark();

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { userAddress: _userAddress, setUserLocation: setDriverLocation } =
    useDriver();
  const { activeRideId, giveRideDetails, removeRideOffer, setActiveRideId } = useRideOfferStore(
    (state) => state,
  );
  const { ws } = useWSStore();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showTollModal, setShowTollModal] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [completion, setCompletion] = useState<CompletionSummary | null>(null);
  const [completedRideId, setCompletedRideId] = useState<string | null>(null);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  // LOW-8: last reverse-geocoded address, reused while the position barely
  // moves instead of re-geocoding on every watch tick.
  const lastAddressRef = useRef("");

  // Only the driver Home screen creates the WebSocket. If we got here without
  // one the connection is dead — the ride can still complete over HTTP, but
  // nothing else works, so send the driver home (Home owns reconnect).
  useEffect(() => {
    if (!ws) {
      Alert.alert("Connection Lost", "You are no longer connected to the server. Returning home.", [
        { text: "OK", onPress: () => router.replace("/(main)/(rider)") },
      ]);
    }
  }, [ws, router]);

  // ── Ride-cancellation handling ─────────────────────────────────────
  // Home owns the socket + its own onmessage, but while the driver is on the
  // drop-off screen this screen must react to ride:cancelled / rider:cancelled.
  // Without this the "Slide to Confirm Drop-off" button stays live on a
  // cancelled ride (and Home's handler only resets store state, it does not
  // navigate). Use addEventListener (NOT ws.onmessage, which would clobber
  // Home's handler) and remove the listener on unmount (N4).
  useEffect(() => {
    if (!ws) return;
    const handleWsMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type as string;
        if (type === "ride:cancelled" || type === "rider:cancelled") {
          // N2/M-7: a driver's own cancel must not raise a "Rider cancelled"
          // alert, and a system cancel (timeout, admin) isn't the rider's
          // doing either — only rider-initiated cancels get that copy.
          const cancelledByDriver = msg.cancelled_by === "driver";
          const cancelledBySystem = msg.cancelled_by === "system";
          if (!cancelledByDriver && !cancelledBySystem) {
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

  const calculateDistance = (
    location1: LocationObject,
    location2: LocationObject,
  ) => {
    const lat1 = location1.coords.latitude;
    const lon1 = location1.coords.longitude;
    const lat2 = location2.coords.latitude;
    const lon2 = location2.coords.longitude;
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1000;
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
          if (
            lastLocationRef.current &&
            calculateDistance(lastLocationRef.current, location) >= 5
          ) {
            const address = await Location.reverseGeocodeAsync({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            });
            lastAddressRef.current = address[0]?.formattedAddress ?? "";
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "location:update",
                  role: "driver",
                  ride_id: activeRideId,
                  lat: location.coords.latitude,
                  lng: location.coords.longitude,
                }),
              );
            }
            lastLocationRef.current = location;
          } else if (!lastLocationRef.current) {
            lastLocationRef.current = location;
          }
          // LOW-8: only the ≥5m branch reverse-geocodes; ticks that barely
          // moved reuse the last resolved address instead of firing a second
          // reverseGeocodeAsync on every watch callback.
          setDriverLocation({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            address: lastAddressRef.current,
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
      }
    };
  }, [user]);

  const rideDetails = giveRideDetails(activeRideId!);
  const customerPhone = rideDetails?.customerDetails?.number || "";
  const rideDuration = rideDetails?.duration || "0 mins";
  const rideDistance = rideDetails?.distance || "0 km";
  const pickupAddress =
    rideDetails?.pickupDetails?.pickupAddress || "Pickup location";
  const destinationAddress =
    rideDetails?.dropoffDetails?.dropoffAddress || "Destination not set";

  const handleSlideComplete = async () => {
    // Complete the ride via the HTTP endpoint (NOT the WS message). The HTTP
    // /api/ride/[id]/complete recalculates the fare from actual ride time +
    // distance, applies the intercity split and commission, and emits the
    // proper WS event *with* the fare breakdown to the rider. The old WS
    // ride:complete path only flipped the status and sent no breakdown —
    // leaving the rider's receipt and the ledger wrong on every ride.
    if (!activeRideId) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    try {
      const res = await fetch(`${API_URL}/api/ride/${activeRideId}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert(
          "Could not complete ride",
          data.message || `Server returned ${res.status}`,
        );
        return;
      }
      const data: {
        fare_breakdown?: { total_bdt?: number; distance_km?: number; ride_time_min?: number };
        total_bdt?: number;
        ride_time_min?: number;
        upfront_tip_forfeited_bdt?: number;
        rider_payable_bdt?: number;
        wallet_debit_bdt?: number;
      } = await res.json().catch(() => ({}));
      const fb = data.fare_breakdown ?? {};
      setCompletion({
        total_bdt: fb.total_bdt ?? data.total_bdt ?? 0,
        distance_km: fb.distance_km ?? null,
        ride_time_min: data.ride_time_min ?? fb.ride_time_min ?? null,
        upfront_tip_forfeited_bdt: data.upfront_tip_forfeited_bdt ?? 0,
        rider_payable_bdt: data.rider_payable_bdt ?? undefined,
        wallet_debit_bdt: data.wallet_debit_bdt ?? undefined,
      });
      setCompletedRideId(activeRideId);
      removeRideOffer(activeRideId);
      // LOW-9: the ride is done — drop the active ride id (previously only the
      // cancellation paths cleared it, so a stale id lingered after completion).
      setActiveRideId(null);
      setShowModal(true);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Network error completing ride");
    }
  };

  const handleCallCustomer = () => {
    if (customerPhone) {
      Linking.openURL(`tel:${customerPhone}`).catch(() =>
        Alert.alert("Error", "Unable to place call."),
      );
    }
  };

  const openNav = () => {
    if (activeRideId) router.push(`/(main)/(rider)/customer-navigation/${activeRideId}`);
  };

  const openChat = () => {
    if (activeRideId) router.push(`/(main)/(rider)/chat/${activeRideId}`);
  };

  const handleGoHome = () => {
    router.replace("/(main)/(rider)");
  };

  // Prefer the values recalculated server-side in the complete response;
  // fall back to what the offer carried (fare in the store is paisa).
  const totalPaisa =
    completion?.total_bdt ?? Number(rideDetails?.fare || 0);
  // H-3: the cash line must be the rider's actual out-of-pocket, not the
  // gross fare — a wallet redemption or collected tip already settled part of
  // the bill. Fall back to the gross fare when the response predates the
  // fields (server never returns them).
  const cashPaisa =
    completion?.rider_payable_bdt != null
      ? completion.rider_payable_bdt - (completion.wallet_debit_bdt ?? 0)
      : totalPaisa;
  const distanceText =
    completion?.distance_km != null
      ? `${completion.distance_km.toFixed(1)} km`
      : rideDistance;
  const durationText =
    completion?.ride_time_min != null
      ? `${completion.ride_time_min} min`
      : rideDuration;

  const labelStyle = {
    fontSize: 13,
    color: textSecondary,
    fontFamily: "Jakarta-SemiBold",
  };
  const valueStyle: TextStyle = {
    fontSize: 13,
    color: textPrimary,
    fontFamily: "Jakarta-SemiBold",
    fontVariant: ["tabular-nums"],
  };

  return (
    <>
      <RideLayout disabled={true} title="" snapPoints={["40%", "50%"]}>
        <View style={{ justifyContent: "space-between" }}>
        {/* Heading */}
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
        />

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
            Contact or navigate while on trip
          </Text>
          <DriverActionBar
            onCall={handleCallCustomer}
            onNavigate={openNav}
            onChat={openChat}
          />
        </View>

        {/* Slide */}
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
            Slide to confirm once you&apos;ve reached the dropoff location
          </Text>
          <SlideButton
            title="Slide to Confirm Drop-off"
            onComplete={handleSlideComplete}
            bgColor={colors.slideGreen}
            textColor={colors.white}
          />
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

      {/* Dropoff Confirmed Modal */}
      <ReactNativeModal isVisible={showModal}>
        <View
          style={{
            backgroundColor: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
            padding: spacing["2xl"],
            borderRadius: radii["2xl"],
            borderWidth: 1,
            borderColor: isDark ? colors.borderDark : colors.borderLight,
            width: "91%",
            alignSelf: "center",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <SuccessCheckmark />
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Jakarta-Bold",
                color: textPrimary,
                textAlign: "center",
                marginBottom: spacing.xs,
              }}
            >
              Ride Completed
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: textSecondary,
                fontFamily: "Jakarta-Regular",
                textAlign: "center",
              }}
            >
              You&apos;ve successfully dropped off the customer.
            </Text>
          </View>

          {/* Cash collection — dominant */}
          <Text
            style={{
              fontSize: 28,
              fontFamily: "Jakarta-Bold",
              color: colors.accent,
              textAlign: "center",
              marginBottom: spacing.lg,
              fontVariant: ["tabular-nums"],
            }}
          >
            Collect ৳{(cashPaisa / 100).toFixed(2)} cash from rider
          </Text>

          {/* N3: forfeited upfront tip — never let a promised tip vanish silently */}
          {(completion?.upfront_tip_forfeited_bdt ?? 0) > 0 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
                backgroundColor: colors.amber + "1A",
                borderRadius: radii.md,
                padding: spacing.md,
                marginBottom: spacing.lg,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={colors.amber} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: colors.amber,
                }}
              >
                Upfront tip ৳{((completion?.upfront_tip_forfeited_bdt ?? 0) / 100).toFixed(2)} could not
                be collected from the rider's wallet.
              </Text>
            </View>
          )}

          {/* Fare Summary */}
          <View
            style={{
              marginVertical: spacing.lg,
              backgroundColor: isDark ? colors.bgDark : colors.gray100,
              borderRadius: radii.md,
              padding: spacing.lg,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={labelStyle}>Total Fare</Text>
              <Text
                style={[valueStyle, { color: colors.primary, fontSize: 16 }]}
              >
                ৳{(totalPaisa / 100).toFixed(2)}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={labelStyle}>Distance</Text>
              <Text style={valueStyle}>{distanceText}</Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: spacing.sm,
              }}
            >
              <Text style={labelStyle}>Duration</Text>
              <Text style={valueStyle}>{durationText}</Text>
            </View>
          </View>

          <CustomButton
            title="Rate Rider"
            className="w-full mb-3"
            onPress={() => {
              setShowModal(false);
              if (completedRideId) {
                router.push(`/(main)/(rider)/rate-rider?rideId=${completedRideId}`);
              }
            }}
          />
          <CustomButton
            title="Back to Home"
            className="w-full"
            onPress={handleGoHome}
          />
        </View>
      </ReactNativeModal>

      <TollParkingModal visible={showTollModal} rideId={activeRideId} onClose={() => setShowTollModal(false)} />
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
    </>
  );
};

export default FinishRide;
