import { colors } from "@/theme/goRide";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Platform,
  RefreshControl,
} from "react-native";
import React, { useEffect, useRef, useState } from "react";
import RiderHeader from "@/components/RiderHeader";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/lib/session";
import CustomButton from "@/components/CustomButton";
import ReactNativeModal from "react-native-modal";
import { router, usePathname } from "expo-router";
import * as Location from "expo-location";
import { LocationObject } from "expo-location";
import {
  useDriver,
  useDriverDetails,
  useRideOfferStore,
  useAppUserStore,
  useWSStore,
} from "@/store";
import { AntDesign } from "@expo/vector-icons";
import RiderRidesItem from "@/components/RiderRidesItem";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
// import LottieView from 'lottie-react-native';

const WEBSOCKET_API_URL = Constants.expoConfig?.extra?.webSocketServerUrl;
const API_URL = Constants.expoConfig?.extra?.serverUrl;

let LottieView: any = () => null;

if (Platform.OS !== "web") {
  try {
    LottieView = require("lottie-react-native").default;
  } catch (err) {
    logger.warn("LottieView native import failed:", err);
    LottieView = function LottieViewFallback() {
      return null;
    };
  }
}

const RideHome = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const { user, isLoaded } = useSession();
  const [showVerifyModal, setShowVerifyModal] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const locationUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const [todayEarnings, setTodayEarnings] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [_, forceUpdate] = useState(0);
  const path = usePathname();

  const {
    userAddress,
    setUserLocation: setDriverLocation,
    setId: setDriverId,
    setRole: setDriverRole,
    setFullName: setDriverFullName,
  } = useDriver();

  const { ws, setWebSocket } = useWSStore((state) => state);

  const {
    addRideOffer,
    removeRideOffer,
    rideOffer,
    giveRideDetails,
    setActiveRideId,
  } = useRideOfferStore();

  const { isVerified, setIsVerified, onDuty } = useDriverDetails();

  const { role } = useAppUserStore();
  const data = user?.publicMetadata;

  const sendLocationToWebSocket = async () => {
    if (isVerified && onDuty) {
      logger.info("Sending location to all customers");
      if (ws && ws.readyState === WebSocket.OPEN) {
        let location = await Location.getCurrentPositionAsync();
        const address = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });

        ws.send(
          JSON.stringify({
            type: "riderLocationUpdate",
            role: "rider",
            driverId: user!.id,
            location: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              address: address[0]?.formattedAddress,
            },
          }),
        );
      }
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      sendLocationToWebSocket();
      forceUpdate((n) => n + 1);
    } catch (error) {
      logger.error("Failed to refresh user:", error);
    }
    setRefreshing(false);
  };

  useEffect(() => {
    if (isVerified) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (!onDuty) {
          ws.send(
            JSON.stringify({
              type: "offDuty",
              role: "rider",
              driverId: user?.id,
            }),
          );
        } else {
          // 🚀 When toggled ON duty, tell the websocket
          logger.info("bapu on duty");
          ws.send(
            JSON.stringify({
              type: "onDuty",
              role: "rider",
              driverId: user?.id,
            }),
          );

          // Optionally send latest location immediately
          sendLocationToWebSocket();
        }
      }
    }
  }, [onDuty]);

  //delete
  const removeRide = (id: string) => {
    const details = giveRideDetails(id);
    removeRideOffer(id);
    if (ws && ws.readyState === WebSocket.OPEN && details !== undefined) {
      ws.send(
        JSON.stringify({
          type: "rejectRideOffer",
          role: "rider",
          id,
          driver_id: user?.id,
          customer_id: details.customer_id,
        }),
      );
    }
  };

  const acceptRide = (id: string) => {
    const details = giveRideDetails(id);
    setActiveRideId(id);
    if (ws && ws.readyState === WebSocket.OPEN && details !== undefined) {
      ws.send(
        JSON.stringify({
          type: "acceptRideOffer",
          role: "rider",
          id,
          driver_id: user?.id,
          customer_id: details.customer_id,
        }),
      );
    }
    router.replace("/(main)/(rider)/find-customer");
  };

  useEffect(() => {
    if (!user) return;

    let socket: WebSocket;
    if (!ws) {
      const newWs = new WebSocket(WEBSOCKET_API_URL);

      newWs.onopen = () => {
        newWs.send(
          JSON.stringify({
            type: "register",
            id: user.id,
            role: "rider",
          }),
        );
        logger.info("WebSocket connected");
      };

      newWs.onerror = () => {
        logger.info("An error occurred while connecting to the server.");
      };

      newWs.onclose = () => {
        logger.info("WebSocket closed");
      };
      setWebSocket(newWs);
      socket = newWs;
    } else {
      socket = ws;
    }

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      logger.info("Message received from WebSocket:", message);
      logger.info("😂");
      logger.info(message.rideDetails);
      if (message.type === "newRideOffer") {
        addRideOffer(message.rideDetails);
        Notifications.scheduleNotificationAsync({
          content: {
            title: "New Ride Offer!",
            body: `Pickup at ${message.rideDetails.pickupDetails.pickupAddress}`,
            data: { rideId: message.rideDetails.id },
            badge: 1,
            sound: "default",
            color: colors.surfaceLight, // White badge for dark logo
          },
          trigger: null,
        });
      }
    };
  }, [ws]);

  logger.info("WebSocket instance in RideHome", ws);

  const registerForPushNotificationsAsync = async () => {
    let token;

    if (Device.isDevice) {
      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") {
        alert("Failed to get push token for push notification!");
        return;
      }
      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })
      ).data;
      logger.info("Expo Push Token:", token);
    } else {
      alert("Must use physical device for Push Notifications");
    }

    if (Platform.OS === "android") {
      Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: colors.surfaceLight,
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    }

    return token;
  };

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  useEffect(() => {
    setLoading(true);
    const getDriverData = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`${API_URL}/api/driver/get`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.length === 0 || data[0].profile_image_url === "") {
          setIsVerified(false);
          return;
        }
        setIsVerified(true);
      } catch (error: any) {
        logger.info("API fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      getDriverData();
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const getDriverEarnings = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch(`${API_URL}/api/driver/calculate-price`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setTodayEarnings(data.totalEarnings);
      } catch (error) {
        logger.info("API fetch error:", error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      getDriverEarnings();
    }
  }, [user]);

  useEffect(() => {
    if (!isLoaded) return;
    if (loading) return;
    if (path !== "/home") return;

    if (!isVerified) {
      setShowVerifyModal(true);

      // Set up interval only once
      if (!timerRef.current) {
        timerRef.current = setInterval(() => {
          setShowVerifyModal(true);
        }, 6000); // 6 seconds
      }
    } else {
      // ✅ Clear modal and interval if verified
      setShowVerifyModal(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoaded, isVerified, loading, path]);

  const calculateDistance = (
    location1: LocationObject,
    location2: LocationObject,
  ) => {
    const lat1 = location1.coords.latitude;
    const lon1 = location1.coords.longitude;
    const lat2 = location2.coords.latitude;
    const lon2 = location2.coords.longitude;

    const toRad = (value: number) => (value * Math.PI) / 180;

    const R = 6371; // Radius of the Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c * 1000; // Distance in meters
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
          distanceInterval: 2, // in meters
        },
        async (location) => {
          logger.info("📍 Watched location:", location);

          // Check if the location has changed significantly
          if (lastLocationRef.current) {
            const distance = calculateDistance(
              lastLocationRef.current,
              location,
            );

            // If distance exceeds 5 meters, send the location update
            if (distance >= 5) {
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
              // Update the last known location
              lastLocationRef.current = location;
            }
          } else {
            // Set the initial location
            lastLocationRef.current = location;
          }

          // Update the driver location in the store
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

    if (user && onDuty) {
      startWatching();
    }

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
        locationSubscription = null;
      }
    };
  }, [user, onDuty]);

  useEffect(() => {
    const requestLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        return;
      }
      let location = await Location.getCurrentPositionAsync();
      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      logger.info(address);
      setHasPermissions(true);

      // Send initial location to WebSocket when permissions are granted
      if (ws && ws.readyState === WebSocket.OPEN) {
        logger.info("sending driver location to the websocket");
        sendLocationToWebSocket();
      }

      if ((role ?? data?.role) === "rider") {
        setDriverLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: address[0]?.formattedAddress ?? "",
        });

        if (role) setDriverRole({ role });
        if (user) {
          setDriverId({ customerId: user.id });
          setDriverFullName({ full_name: user.fullName ?? "" });
        }
      }
    };
    logger.info("Interval running: onDuty=", onDuty, "isVerified=", isVerified);

    if (user && onDuty) {
      requestLocation();
      // Set up polling to continuously update location every 50 seconds
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
      }
      locationUpdateIntervalRef.current = setInterval(() => {
        sendLocationToWebSocket();
      }, 50000); // Update every 50 seconds
    }

    // Clear interval on unmount
    return () => {
      if (locationUpdateIntervalRef.current) {
        clearInterval(locationUpdateIntervalRef.current);
        locationUpdateIntervalRef.current = null;
      }
    };
  }, [user, userAddress, onDuty]);

  // Interval handling for location updates
  useEffect(() => {
    if (!user || !onDuty) return;

    const locationUpdateInterval = setInterval(() => {
      sendLocationToWebSocket();
    }, 50000);

    return () => clearInterval(locationUpdateInterval); // Clean up interval when onDuty status changes
  }, [user, onDuty]);

  const handleDismissModal = () => {
    setShowVerifyModal(false);
  };

  const handleStartVerification = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setShowVerifyModal(false);
    router.push("/(main)/(rider)/verification");
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      {loading ? (
        <View className="flex-1 justify-center items-center gap-y-10 px-8">
          <Text className="text-goTextPrimaryLight font-urbanist-bold text-3xl text-center">
            Loading the rider details...
          </Text>
          <ActivityIndicator size={80} color={colors.textPrimaryLight} />
        </View>
      ) : (
        <>
          <RiderHeader
            hasPermissions={hasPermissions}
            todayEarnings={todayEarnings}
          />

          {isVerified ? (
            <FlatList
              data={!onDuty ? [] : rideOffer}
              renderItem={({ item }) => (
                <RiderRidesItem
                  removeIt={() => removeRide(item.id)}
                  item={item}
                  acceptRide={() => acceptRide(item.id)}
                />
              )}
              keyExtractor={(item, index) =>
                item?.id?.toString() || `fallback-key-${index}`
              }
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                padding: 16,
                flexGrow: 1,
                justifyContent:
                  rideOffer.length === 0 ? "center" : "flex-start",
                alignItems: rideOffer.length === 0 ? "center" : "stretch",
              }}
              ListEmptyComponent={
                <View className="flex-1 justify-center items-center px-8">
                  {onDuty ? (
                    <View className="items-center justify-center mt-6">
                      <LottieView
                        source={require("@/assets/animations/no-rides.json")}
                        autoPlay
                        loop
                        style={{ width: 250, height: 250 }}
                      />
                    </View>
                  ) : (
                    <AntDesign
                      name="poweroff"
                      size={100}
                      color={colors.textPrimaryLight}
                    />
                  )}
                  <Text className="text-goTextPrimaryLight text-xl font-urbanist-medium text-center mt-8 leading-7">
                    {onDuty
                      ? "There are no available rides. Stay active!"
                      : "You're currently OFF duty.\nSwitch to ON duty to start earning."}
                  </Text>
                </View>
              }
              refreshControl={
                onDuty ? (
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    colors={[colors.black]} // Android
                    tintColor={colors.black} // iOS
                  />
                ) : undefined
              }
            />
          ) : (
            <View className="flex-1 justify-center items-center px-8">
              <Text className="text-goTextPrimaryLight text-2xl font-urbanist-bold text-center mb-4">
                Verification Required
              </Text>
              <Text className="text-goTextSecondaryLight font-inter text-center mb-6">
                Please verify your details to start earning.
              </Text>
              <CustomButton
                title="Verify Now"
                className="w-4/6"
                onPress={handleStartVerification}
              />
            </View>
          )}

          {/* Modal */}
          <ReactNativeModal isVisible={showVerifyModal}>
            <View className="bg-goSurfaceLight p-6 rounded-2xl items-center">
              <Text className="text-xl font-urbanist-bold text-goTextPrimaryLight text-center mb-3">
                Verification Required
              </Text>
              <Text className="text-goTextSecondaryLight font-inter text-center mb-5">
                Please verify your details to start earning.
              </Text>
              <CustomButton
                title="Verify Now"
                className="w-full"
                onPress={handleStartVerification}
              />
              <CustomButton
                title="Later"
                className="mt-4 bg-goBorderLight w-1/2"
                onPress={handleDismissModal}
              />
            </View>
          </ReactNativeModal>
        </>
      )}
    </SafeAreaView>
  );
};

export default RideHome;
