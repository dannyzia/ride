import { colors, spacing, radii } from "@/theme/goRide";
import { SuccessCheckmark } from "@/components/SuccessCheckmark";
import TollParkingModal from "@/components/TollParkingModal";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  Linking,
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
import { icons } from "@/constants/data";

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const WEBSOCKET_API_URL = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

const FinishRide = () => {
  const router = useRouter();
  const { user } = useSession();

  const { userAddress: _userAddress, setUserLocation: setDriverLocation } =
    useDriver();
  const { activeRideId, giveRideDetails, removeRideOffer } = useRideOfferStore(
    (state) => state,
  );
  const { ws, setWebSocket } = useWSStore();
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showTollModal, setShowTollModal] = useState(false);
  const [verifyReached, _setVerifyReached] = useState<boolean>(false);
  const [verifyReachedStage, setVerifyReachedStage] = useState<
    "waiting" | "alert"
  >("waiting");
  const lastLocationRef = useRef<Location.LocationObject | null>(null);

  useEffect(() => {
    if (!ws) {
      const newWs = new WebSocket(WEBSOCKET_API_URL);
      newWs.onopen = () => {};
      newWs.onerror = () => {};
      setWebSocket(newWs);
    }
    // NOTE: do NOT assign ws.onmessage here. Assigning ws.onmessage
    // overwrites the driver Home's ride:offer handler, so after finishing one
    // ride the driver stopped receiving offer popups entirely. The messages
    // this previously handled (reachedVerified / customerDidNotVerify) were
    // legacy types from the old drop-off flow and are no longer sent.
  }, [ws]);

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
            setDriverLocation({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              address: address[0]?.formattedAddress!,
            });
            lastLocationRef.current = location;
          } else if (!lastLocationRef.current) {
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
      }
    };
  }, [user]);

  const rideDetails = giveRideDetails(activeRideId!);
  const customerPhone = rideDetails?.customerDetails?.number || "";
  const rideDuration = rideDetails?.duration || "0 mins";
  const rideFare = rideDetails?.fare || "0";
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
      removeRideOffer(activeRideId);
      setShowModal(true);
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Network error completing ride");
    }
  };

  const handleCallCustomer = () => {
    if (customerPhone) {
      Linking.openURL(`tel:${customerPhone}`).catch(() =>
        Alert.alert("Error", "Unable to place call."),
      );
    }
  };

  const handleCallSupport = () => {
    Linking.openURL("tel:16263").catch(() =>
      Alert.alert("Error", "Unable to place call."),
    );
  };

  const openNav = () => {
    if (activeRideId) router.push(`/(main)/(rider)/customer-navigation/${activeRideId}`);
  };

  const openChat = () => {
    if (activeRideId) router.push(`/(main)/(rider)/chat/${activeRideId}`);
  };

  const handleGoHome = () => {
    _setVerifyReached(false);
    setVerifyReachedStage("waiting");
    if (activeRideId) {
      removeRideOffer(rideDetails?.id!);
    }
    router.replace("/(main)/(rider)");
  };

  const rowStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: spacing.sm,
  };
  const labelStyle = {
    fontSize: 13,
    color: colors.textSecondaryDark,
    fontFamily: "JakartaBold",
  };
  const valueStyle = {
    fontSize: 13,
    color: colors.textPrimaryDark,
    fontFamily: "Urbanist",
    fontWeight: "600" as const,
  };

  return (
    <RideLayout disabled={true} title="" snapPoints={["40%", "50%"]}>
      <View style={{ justifyContent: "space-between" }}>
        {/* Heading */}
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            fontFamily: "Urbanist",
            color: colors.textPrimaryDark,
            marginBottom: spacing["2xl"],
          }}
        >
          Ride Details
        </Text>

        {/* Pickup */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            marginBottom: spacing.lg,
          }}
        >
          <Image
            source={icons.origin}
            style={{ height: 24, width: 24, marginTop: 2 }}
            resizeMode="contain"
          />
          <Text
            style={{
              marginLeft: spacing.md,
              fontSize: 15,
              color: colors.textPrimaryDark,
              flex: 1,
              lineHeight: 22,
              fontFamily: "Urbanist",
            }}
          >
            {pickupAddress}
          </Text>
        </View>

        {/* Destination */}
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <Image
            source={icons.destination}
            style={{ height: 24, width: 24, marginTop: 2 }}
            resizeMode="contain"
          />
          <Text
            style={{
              marginLeft: spacing.md,
              fontSize: 15,
              color: colors.textPrimaryDark,
              flex: 1,
              lineHeight: 22,
              fontFamily: "Urbanist",
            }}
          >
            {destinationAddress}
          </Text>
        </View>

        {/* Call Customer */}
        {customerPhone ? (
          <View
            style={{
              marginTop: spacing["3xl"],
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.bgDark,
              padding: spacing.lg,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: colors.borderDark,
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 15,
                  fontFamily: "Urbanist",
                  fontWeight: "500",
                  color: colors.textPrimaryDark,
                }}
              >
                Need Help?
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.textSecondaryDark,
                  fontFamily: "Urbanist",
                }}
              >
                Call the customer
              </Text>
            </View>
            <View style={{ flexDirection: "row" }}>
              <TouchableOpacity
                onPress={handleCallCustomer}
                style={{
                  backgroundColor: colors.primary,
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.pill,
                  marginRight: 8,
                }}
              >
                <Text
                  style={{
                    color: colors.white,
                    fontFamily: "Urbanist",
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  Call
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openNav}
                style={{ backgroundColor: colors.gray600, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, marginRight: 8 }}>
                <Text style={{ color: colors.white, fontFamily: "Urbanist", fontWeight: "700", fontSize: 14 }}>🗺️ Nav</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openChat}
                style={{ backgroundColor: colors.gray600, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill }}>
                <Text style={{ color: colors.white, fontFamily: "Urbanist", fontWeight: "700", fontSize: 14 }}>💬 Chat</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Slide */}
        <View style={{ marginTop: spacing["3xl"] }}>
          <Text
            style={{
              textAlign: "center",
              color: colors.textSecondaryDark,
              fontSize: 13,
              fontFamily: "Urbanist",
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
            onPress={() => activeRideId && router.push(`/(main)/(rider)/cancellation-reasons?rideId=${activeRideId}`)}
            className="mt-4 items-center"
          >
            <Text className="text-goDanger text-[14px] font-JakartaBold">Cancel Ride</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowTollModal(true)} className="mt-3 py-2 px-4 rounded-full bg-goGray600 dark:bg-goSurfaceElevatedDark items-center">
            <Text className="text-white font-JakartaBold text-[14px]">🧾 Add Charge</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Dropoff Confirmed Modal */}
      <ReactNativeModal isVisible={showModal}>
        <View
          style={{
            backgroundColor: colors.surfaceElevatedDark,
            padding: spacing["2xl"],
            borderRadius: radii["2xl"],
            borderWidth: 1,
            borderColor: colors.borderDark,
            width: "91%",
            alignSelf: "center",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: spacing.lg }}>
            <SuccessCheckmark />
            <Text
              style={{
                fontSize: 20,
                fontFamily: "Urbanist",
                fontWeight: "700",
                color: colors.textPrimaryDark,
                textAlign: "center",
                marginBottom: spacing.xs,
              }}
            >
              Ride Completed
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.textSecondaryDark,
                fontFamily: "Urbanist",
                textAlign: "center",
              }}
            >
              You&apos;ve successfully dropped off the customer.
            </Text>
          </View>

          {/* Fare Summary */}
          <View
            style={{
              marginVertical: spacing.lg,
              backgroundColor: colors.bgDark,
              borderRadius: radii.md,
              padding: spacing.lg,
            }}
          >
            <View style={rowStyle}>
              <Text style={labelStyle}>Total Fare</Text>
              <Text
                style={[valueStyle, { color: colors.primary, fontSize: 16 }]}
              >
                ৳{rideFare}
              </Text>
            </View>
            <View style={rowStyle}>
              <Text style={labelStyle}>Distance</Text>
              <Text style={labelStyle}>{rideDistance}</Text>
            </View>
            <View style={rowStyle}>
              <Text style={labelStyle}>Duration</Text>
              <Text style={labelStyle}>{rideDuration}</Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: 15,
              fontFamily: "Urbanist",
              fontWeight: "500",
              color: colors.textPrimaryDark,
              marginBottom: spacing.lg,
            }}
          >
            Collect Payment From Customer
          </Text>

          <CustomButton
            title="Rate Rider"
            className="w-full mb-3"
            onPress={() => { setShowModal(false); router.push(`/(main)/(rider)/rate-rider?rideId=${activeRideId}`); }}
          />
          <CustomButton
            title="Browse Home"
            className="w-full"
            onPress={handleGoHome}
          />
        </View>
      </ReactNativeModal>

      {/* Waiting / Alert Modal */}
      <ReactNativeModal isVisible={verifyReached}>
        <View
          style={{
            backgroundColor: colors.surfaceElevatedDark,
            borderWidth: 1,
            borderColor: colors.borderDark,
            padding: spacing["2xl"],
            borderRadius: radii["2xl"],
            alignItems: "center",
            width: "91%",
            alignSelf: "center",
          }}
        >
          {verifyReachedStage === "waiting" ? (
            <>
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: "Urbanist",
                  fontWeight: "700",
                  color: colors.textPrimaryDark,
                  textAlign: "center",
                  marginBottom: spacing.sm,
                }}
              >
                Waiting for Customer Confirmation
              </Text>
              <Text
                style={{
                  textAlign: "center",
                  color: colors.textSecondaryDark,
                  fontFamily: "Urbanist",
                  marginBottom: spacing.xl,
                }}
              >
                Request sent to customer. Awaiting their drop-off confirmation.
              </Text>
              <ActivityIndicator size="small" color={colors.primary} />
            </>
          ) : (
            <>
              <Text
                style={{
                  fontSize: 20,
                  fontFamily: "Urbanist",
                  fontWeight: "700",
                  color: colors.danger,
                  textAlign: "center",
                  marginBottom: spacing.sm,
                }}
              >
                ⚠️ No Response from Customer
              </Text>
              <Text
                style={{
                  textAlign: "center",
                  color: colors.textSecondaryDark,
                  fontFamily: "Urbanist",
                  marginBottom: spacing["2xl"],
                }}
              >
                Customer hasn&apos;t confirmed. Please check their safety or
                report the situation.
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  marginBottom: spacing.xl,
                  gap: 8,
                }}
              >
                <CustomButton
                  title="Call Customer"
                  className="w-1/2 mb-3"
                  onPress={handleCallCustomer}
                />
                <CustomButton
                  title="Call Support"
                  bgVariant="danger"
                  textVariant="primary"
                  className="w-1/2 mb-3"
                  onPress={handleCallSupport}
                />
              </View>
              <CustomButton
                title="Browse Home"
                bgVariant="secondary"
                textVariant="secondary"
                className="w-full"
                onPress={handleGoHome}
              />
            </>
          )}
        </View>
    </ReactNativeModal>
    <TollParkingModal visible={showTollModal} rideId={activeRideId} onClose={() => setShowTollModal(false)} />
  </RideLayout>
  );
};

export default FinishRide;
