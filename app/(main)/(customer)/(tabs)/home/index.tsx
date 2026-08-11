import { useTranslation } from "react-i18next";
import { API_URL, WS_URL } from "@/lib/config";
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
import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { getBarikoiReverseGeocodeUrl } from "@/lib/useBarikoiMapStyle";
import {
  useCustomer,
  useRidesStore,
  useAppUserStore,
  useWSStore,
} from "@/store";
import ScreenLabel from "@/components/ScreenLabel";
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

const HomePage = () => {
  const { t } = useTranslation();
  const {
    setUserLocation: setCustomerLocation,
    setId: setCustomerId,
    setRole: setCustomerRole,
    setFullName: setCustomerFullName,
    setProfileImageURL: setCustomerProfileImageURL,
    userAddress,
    userLatitude,
    userLongitude,
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
  // Name from the API (most authoritative). Falls back to the session's
  // user_metadata.name (available immediately at mount, zero network) and
  // finally to "Rider". Mirrors how the driver home uses driver?.name.
  const [apiName, setApiName] = useState<string | null>(null);
  const displayName = apiName ?? user?.fullName ?? "Rider";
  const [gpsError, setGpsError] = useState<string | null>(null);
  const reconnectAttempts = useRef(0);

  // Diagnostic: trace name resolution
  useEffect(() => {
    logger.info("[home] name resolution:", {
      apiName,
      sessionFullName: user?.fullName,
      displayName,
      hasUser: !!user,
    });
  }, [apiName, user?.fullName, displayName, user]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user?.name) setApiName(data.user.name);
        } else {
          logger.warn(`[home] /api/user/me returned ${res.status}`);
        }
      } catch (err) {
        logger.warn("[home] failed to load display name:", err);
      }
    })();
  }, [user]);

  //setting the ws server
  useEffect(() => {
    if (!user) return;

    // Reuse an already-open socket (e.g. returning to Home) — no duplicates.
    const existing = useWSStore.getState().ws;
    if (existing && existing.readyState === WebSocket.OPEN) return;

    let ws: WebSocket;

    const connect = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempts.current = 0;
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
          Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30_000) +
          Math.random() * 1000;
        reconnectAttempts.current += 1;
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
    await fetchRides();
    setRefreshing(false);
  };

  const requestLocation = async () => {
    setGpsError(null);
    setAddress("Acquiring location...");
    logger.info("[home] requestLocation STARTED");
    try {
      // Wrap permission request in a timeout — on some devices this native
      // call hangs indefinitely even when permission is already granted.
      let status = "undetermined";
      try {
        const permResult = await Promise.race([
          Location.requestForegroundPermissionsAsync(),
          new Promise<{ status: string }>((resolve) =>
            setTimeout(() => resolve({ status: "granted" }), 5000),
          ),
        ]);
        status = permResult.status;
      } catch (permErr) {
        logger.warn("[home] permission request threw, assuming granted:", permErr);
        status = "granted";
      }
      logger.info("[home] location permission status:", status);
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission not granted");
        setHasPermissions(false);
        setGpsError(
          "Location permission denied. Enable location access in your device settings, then tap retry.",
        );
        setAddress("");
        return;
      }

      setHasPermissions(true);

      // Strategy: try last-known position FIRST (instant, never hangs), then
      // attempt a fresh GPS fix with a short timeout to refine.
      let location: Location.LocationObject | null =
        await Location.getLastKnownPositionAsync();
      logger.info("[home] lastKnownPosition:", location ? `${location.coords.latitude}, ${location.coords.longitude}` : "null");

      if (location) {
        const { latitude, longitude } = location.coords;
        const coordAddress = `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        setAddress(coordAddress);
        if ((role ?? data?.role) === "customer") {
          setCustomerLocation({ latitude, longitude, address: coordAddress });
        }
      }

      // Now try a fresh fix (non-blocking — refine the location if it arrives)
      try {
        const fresh = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 8000),
          ),
        ]);
        if (fresh) {
          const { latitude, longitude } = fresh.coords;
          const coordAddress = `📍 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
          setAddress(coordAddress);
          if ((role ?? data?.role) === "customer") {
            setCustomerLocation({ latitude, longitude, address: coordAddress });
          }
        }
      } catch (e) {
        logger.warn("[home] getCurrentPositionAsync threw:", e);
      }

      // If we still have no location at all, show error
      const currentAddress = useCustomer.getState().userAddress;
      if (!currentAddress && !useCustomer.getState().userLatitude) {
        setGpsError(
          "Unable to get your location. Make sure GPS/Location is enabled in device settings.",
        );
        setAddress("");
      }
    } catch (error) {
      logger.warn("[home] Error in requestLocation:", error);
      setGpsError(
        "Unable to get your location. Tap retry or set a location in your emulator.",
      );
      setAddress("");
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

  const fetchRides = useCallback(async () => {
    if (!user?.id && !user?.uid) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const response = await fetch(`${API_URL}/api/ride/get-all`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const body = await response.json();
        setRides(body.data || []);
      }
    } catch (error) {
      logger.warn("Error fetching rides:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.uid, setRides]);

  //getting all rides from api
  useEffect(() => {
    fetchRides();
  }, [fetchRides]);

  const locationDisplay = address
    ? address
    : userAddress
      ? userAddress
      : (userLatitude && userLongitude)
        ? `📍 ${userLatitude.toFixed(4)}, ${userLongitude.toFixed(4)}`
        : t('home.fetching');

  return (
    <SafeAreaView className="bg-goBgLight flex-1">
      <ScreenLabel screenName="Welcome" screenNumber={1} />
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
                  {t('home.no_recent_rides')}
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
            {t('home.welcome_name', { name: displayName })}
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
                  {t('home.search')}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-5 mb-3">
              <Text>
                <Text className="text-xl text-goTextPrimaryLight font-JakartaBold">
                  {t('home.your_current_location')}
                </Text>{" "}
                {gpsError ? (
                  <Text
                    className="text-lg font-Jakarta"
                    style={{ color: colors.danger }}
                  >
                    {gpsError}
                  </Text>
                ) : (
                  <Text className="text-lg font-Jakarta text-goTextSecondaryLight">
                    {locationDisplay}
                  </Text>
                )}
              </Text>
              {gpsError ? (
                <TouchableOpacity
                  onPress={requestLocation}
                  className="mt-2 self-start bg-goSurfaceLight px-4 py-2 rounded-full"
                >
                  <Text className="text-goTextPrimaryLight font-JakartaBold">
                    Retry
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text className="text-2xl text-goTextPrimaryLight font-JakartaBold tracking-tight mt-10 mb-3">
              {t('home.recent_rides')}
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
