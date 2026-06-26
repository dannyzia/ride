import { colors, spacing, radii } from "@/theme/goRide";
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
import ReactNativeModal from "react-native-modal";
import CustomButton from "@/components/CustomButton";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants/data";

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
  const [verifyReached, setVerifyReached] = useState<boolean>(false);
  const [verifyReachedStage, setVerifyReachedStage] = useState<
    "waiting" | "alert"
  >("waiting");
  const lastLocationRef = useRef<Location.LocationObject | null>(null);

  useEffect(() => {
    let socket: WebSocket;

    if (!ws) {
      const newWs = new WebSocket(WEBSOCKET_API_URL);
      newWs.onopen = () => {};
      newWs.onerror = () => {};
      setWebSocket(newWs);
      socket = newWs;
    } else {
      socket = ws;
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "reachedVerified") {
        if (activeRideId) {
          setVerifyReached(false);
          setVerifyReachedStage("waiting");
          setShowModal(true);
        }
      }
      if (message.type === "customerDidNotVerify") {
        setVerifyReachedStage("alert");
      }
    };
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
                  type: "riderLocationUpdate",
                  role: "rider",
                  driverId: user?.id,
                  location: {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                    address: address[0]?.formattedAddress,
                  },
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
  const customerPhone = rideDetails?.customerDetails.number || "";
  const rideDuration = rideDetails?.duration || "0 mins";
  const rideFare = rideDetails?.fare || "0";
  const rideDistance = rideDetails?.distance || "0 km";
  const pickupAddress =
    rideDetails?.pickupDetails.pickupAddress || "Pickup location";
  const destinationAddress =
    rideDetails?.dropoffDetails.dropoffAddress || "Destination not set";

  const handleSlideComplete = () => {
    if (activeRideId && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "journeyEnds",
          role: "rider",
          customer_id: rideDetails?.customer_id,
          id: rideDetails?.id,
        }),
      );
    }
    setVerifyReached(true);
  };

  const handleCallCustomer = () => {
    if (customerPhone) {
      Linking.openURL(`tel:+91${customerPhone}`).catch(() =>
        Alert.alert("Error", "Unable to place call."),
      );
    }
  };

  const handleCallSupport = () => {
    Linking.openURL("tel:+916290547258").catch(() =>
      Alert.alert("Error", "Unable to place call."),
    );
  };

  const handleGoHome = () => {
    setVerifyReached(false);
    setVerifyReachedStage("waiting");
    if (activeRideId) {
      removeRideOffer(rideDetails?.id!);
    }
    router.replace("/(main)/(rider)/home");
  };

  const rowStyle = {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    marginBottom: spacing.sm,
  };
  const labelStyle = {
    fontSize: 13,
    color: colors.textSecondaryDark,
    fontFamily: "Urbanist",
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
            <TouchableOpacity
              onPress={handleCallCustomer}
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
                borderRadius: radii.pill,
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
              Ride Completed ✅
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
            title="Browse Home"
            className="w-full mt-4"
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
    </RideLayout>
  );
};

export default FinishRide;
