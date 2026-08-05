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
import { useCallback, useEffect, useState } from "react";
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
  const [displayName, setDisplayName] = useState("Rider");
  const [gpsError, setGpsError] = useState<string | null>(null);

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
          if (data.name) setDisplayName(data.name);
        }
      } catch {}
    })();
  }, [user]);

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

      ws = new WebSocket(WS_URL);

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
    setGpsError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Location permission not granted");
        setHasPermissions(false);
        return;
      }

      setHasPermissions(true);

      // Get GPS with timeout
      const location = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("gps_timeout")), 10000),
        ),
      ]);

      const { latitude, longitude } = location.coords;

      // Store coordinates IMMEDIATELY — set both local state and store
      const coordAddress = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
      setAddress(coordAddress);

      if ((role ?? data?.role) === "customer") {
        setCustomerLocation({
          latitude,
          longitude,
          address: coordAddress,
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

      // Now try to resolve a human-readable address (non-blocking for GPS coords)
      let resolvedAddress = "";
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(getBarikoiReverseGeocodeUrl(latitude, longitude), {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          resolvedAddress =
            data?.place?.address ??
            data?.address ??
            data?.places?.[0]?.address ??
            "";
        }
      } catch {
        // Barikoi failed or timed out
      }

      if (!resolvedAddress) {
        try {
          const nativeAddr = await Promise.race([
            Location.reverseGeocodeAsync({ latitude, longitude }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("geocode_timeout")), 5000),
            ),
          ]);
          resolvedAddress = nativeAddr[0]?.formattedAddress ?? "";
        } catch {
          // Both failed — use coordinates as address
        }
      }

      // Update with resolved address if we got one
      const finalAddress = resolvedAddress || coordAddress;
      setAddress(finalAddress);
      if ((role ?? data?.role) === "customer") {
        setCustomerLocation({
          latitude,
          longitude,
          address: finalAddress,
        });
      }
    } catch (error) {
      logger.warn("Error in requestLocation:", error);
      setGpsError(
        "Unable to get your location. Tap retry or set a location in your emulator.",
      );
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
                    {address
                      ? address
                      : userAddress
                        ? userAddress
                        : userLatitude
                          ? userLatitude
                          : t('home.fetching')}
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
