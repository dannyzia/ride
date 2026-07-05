import { colors, spacing, radii } from "@/theme/goRide";
import { View, Text, TouchableOpacity, Linking, Image } from "react-native";
import React, { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import SlideButton from "@/components/SlideButton";
import { useDriver, useRideOfferStore, useWSStore } from "@/store";
import { useSession } from "@/lib/session";
import * as Location from "expo-location";
import { LocationObject } from "expo-location";
import { supabase } from "@/lib/supabase";
import RideLayout from "@/components/RideLayout";
import { icons } from "@/constants/data";

const WEBSOCKET_API_URL = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

const ReachCustomer = () => {
  const router = useRouter();

  const {
    userAddress: _userAddress,
    setUserLocation: setDriverLocation,
    setId: _setDriverId,
    setRole: _setDriverRole,
    setFullName: _setDriverFullName,
  } = useDriver();
  const { ws, setWebSocket } = useWSStore();
  const { activeRideId, giveRideDetails } = useRideOfferStore();
  const { user } = useSession();
  const lastLocationRef = useRef<Location.LocationObject | null>(null);

  useEffect(() => {
    let _socket: WebSocket | null = null;

    if (!ws) {
      const newWs = new WebSocket(WEBSOCKET_API_URL);

      newWs.onopen = async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          newWs.send(
            JSON.stringify({
              type: "auth:hello",
              access_token: token,
              role: "driver",
            }),
          );
        }
      };

      newWs.onerror = () => {};
      setWebSocket(newWs);
      _socket = newWs;
    } else {
      _socket = ws;
    }
  }, [ws]);

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
                    type: "location",
                    action: "update",
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
      alert("Phone number not available");
    }
  };

  return (
    <RideLayout disabled={true} title="" snapPoints={["40%", "50%"]}>
      <View style={{ justifyContent: "space-between" }}>
        {/* Heading */}
        <View>
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

          {/* Pickup Location */}
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
              onPress={callCustomer}
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

        {/* Slide Button */}
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
            Slide to confirm once you&apos;ve reached the pickup location
          </Text>
          <SlideButton
            title="Slide to Confirm Arrival"
            onComplete={handleSlideComplete}
            bgColor={colors.slideGreen}
            textColor={colors.white}
          />
        </View>
      </View>
    </RideLayout>
  );
};

export default ReachCustomer;
