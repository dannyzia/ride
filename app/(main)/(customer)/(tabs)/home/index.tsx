import { colors } from "@/theme/goRide";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  Alert,
  AppState,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { icons, images } from "@/constants/data";
import RideCard from "@/components/RideCard";
import { useCallback, useEffect, useState } from "react";
import * as Location from "expo-location";
import {
  useCustomer,
  useRidesStore,
  useAppUserStore,
  useWSStore,
} from "@/store";
import Map from "@/components/Map";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { logger } from "@/lib/logger";
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

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL;
const WEBSOCKET_API_URL = process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL ?? "";

const HomePage = () => {
  const {
    setUserLocation: setCustomerLocation,
    setId: setCustomerId,
    setRole: setCustomerRole,
    setFullName: setCustomerFullName,
    setProfileImageURL: setCustomerProfileImageURL,
    userAddress,
    userLatitude,
  } = useCustomer();

  const { setRides, Rides } = useRidesStore();
  const { ws: _ws, setWebSocket } = useWSStore();

  const { user } = useSession();
  const { role } = useAppUserStore();
  const data = user ? { role: "customer" } : null;
  const [hasPermissions, setHasPermissions] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [address, setAddress] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [_, forceUpdate] = useState(0);

  //setting the ws server
  useEffect(() => {
    if (!user) return;

    // Reuse an already-open socket (e.g. returning to Home) — no duplicates.
    const existing = useWSStore.getState().ws;
    if (existing && existing.readyState === WebSocket.OPEN) return;

    let ws: WebSocket;
    let reconnectAttempts = 0;

    const connect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      ws = new WebSocket(WEBSOCKET_API_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        setWebSocket(ws);
        // Authenticate (auth:hello) so the server registers this rider and
        // can push ride:status / location:driver.
        ws.send(
          JSON.stringify({
            type: "auth:hello",
            access_token: token,
            role: "rider",
          }),
        );
        logger.info("WebSocket connected");
      };

      ws.onerror = () => {
        logger.warn("An error occurred while connecting to the server.");
      };

      ws.onclose = () => {
        logger.info("WebSocket closed");
        // Reconnect with exponential backoff so a transient close doesn't
        // strand the rider mid-ride.
        const delay =
          Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) +
          Math.random() * 1000;
        reconnectAttempts++;
        setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      // Intentionally do NOT close the socket — it must persist across
      // navigation (Home -> final-page) so the rider keeps receiving updates.
    };
  }, [user]);

  const onRefresh = async () => {
    setRefreshing(true);

    forceUpdate((n) => n + 1);

    setRefreshing(false);
  };

  const requestLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission not granted");
        setHasPermissions(false);
        return;
      }

      setHasPermissions(true);

      const location = await Location.getCurrentPositionAsync();

      const address = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      setAddress(address[0]?.formattedAddress ?? "");

      if ((role ?? data?.role) === "customer") {
        setCustomerLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          address: address[0]?.formattedAddress ?? "",
        });

        if (role) setCustomerRole({ role });
        if (user) {
          setCustomerId({ customerId: user.uid });
          setCustomerFullName({ full_name: user.fullName ?? "" });
          setCustomerProfileImageURL({
            profile_image_url: user.imageUrl ?? "",
          });
        }
      }
    } catch (error) {
      logger.warn("Error in requestLocation:", error);
    }
  };

  useEffect(() => {
    if (user && !hasPermissions && !address) {
      requestLocation();
    }
  }, [user, hasPermissions, address]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      //state === 'active' means that the app is in foreground (not "inactive" and not "background")
      if (state === "active" && user && !hasPermissions) {
        requestLocation();
      }
    });

    return () => subscription.remove();
  }, [user, hasPermissions]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)/phone-entry");
    } catch (err) {
      logger.error("Sign out failed:", err);
    }
  }, []);

  //getting all rides from api
  useEffect(() => {
    if (!user?.uid) return;

    const getAllRides = async () => {
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const response = await fetch(`${API_URL}/api/ride/get-all`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const { data } = await response.json();
        setRides(data);
      } catch (error) {
        logger.warn("Error fetching rides:", error);
      } finally {
        setLoading(false);
      }
    };

    getAllRides();
  }, [user?.uid]);

  return (
    <SafeAreaView className="bg-goBgLight flex-1">
      <FlatList
        data={(Rides || []).slice(0, 3)}
        keyExtractor={(item, index) =>
          item?.ride_id?.toString() || `fallback-key-${index}`
        }
        renderItem={({ item }) => <RideCard ride={item} />}
        className="px-5"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={() => (
          <View className="flex flex-col items-center justify-center">
            {!loading ? (
              <>
                <Image
                  source={images.noResult}
                  className="w-40 h-40"
                  alt="No recent rides found"
                  resizeMode="contain"
                />
                <Text className="text-sm text-goTextPrimaryLight">
                  No recent rides found
                </Text>
              </>
            ) : (
              <View className="items-center justify-center">
                <LottieView
                  source={require("@/assets/animations/loading.json")}
                  autoPlay
                  loop
                  style={{ width: 250, height: 250 }}
                />
              </View>
            )}
          </View>
        )}
        ListHeaderComponent={
          <>
            <View className="flex flex-row items-center justify-between my-5">
              <Text className="text-xl text-goTextPrimaryLight capitalize font-JakartaBold tracking-tight">
                Welcome{","} {user?.fullName ?? "Rider"}
              </Text>
              <TouchableOpacity
                onPress={handleSignOut}
                className="flex justify-center items-center w-10 h-10 rounded-full bg-goSurfaceLight"
              >
                <Image source={icons.out} className="w-4 h-4" />
              </TouchableOpacity>
            </View>

            <View>
              <TouchableOpacity
                onPress={() => router.push("/autocomplete")}
                className="bg-goSurfaceLight rounded-full shadow-go-sm px-4 py-3 mb-4 flex-row items-center gap-x-3"
              >
                <Image source={icons.search} className="w-6 h-6" />
                <Text className="text-goTextSecondaryLight text-base">
                  Search destination...
                </Text>
              </TouchableOpacity>
            </View>

            <Text className="mt-5 mb-3">
              <Text className="text-xl text-goTextPrimaryLight font-JakartaBold">
                Your Current Location:
              </Text>{" "}
              <Text className="text-lg font-Jakarta text-goTextSecondaryLight">
                {address
                  ? address
                  : userAddress
                    ? userAddress
                    : userLatitude
                      ? userLatitude
                      : "Fetching.."}
              </Text>
            </Text>

            <View
              className="w-full"
              style={{ height: 300, borderRadius: 16, overflow: "hidden" }}
            >
              <Map />
            </View>
            <Text className="text-2xl text-goTextPrimaryLight font-JakartaBold tracking-tight mt-10 mb-3">
              Recent Rides
            </Text>
          </>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]} // Android
            tintColor={colors.primary} // iOS
          />
        }
      />
    </SafeAreaView>
  );
};

export default HomePage;
