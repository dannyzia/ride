import { colors, spacing, radii } from "@/theme/goRide";
import { API_URL, WS_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, Linking, Image, Alert, ActivityIndicator } from "react-native";
import React, { useEffect, useRef, useState, Fragment } from "react";
import { useRouter } from "expo-router";
import SlideButton from "@/components/SlideButton";
import { useDriver, useRideOfferStore, useWSStore } from "@/store";
import { useSession } from "@/lib/session";
import * as Location from "expo-location";
import { LocationObject } from "expo-location";
import { supabase } from "@/lib/supabase";
import RideLayout from "@/components/RideLayout";
import TollParkingModal from "@/components/TollParkingModal";
import { icons } from "@/constants/data";

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
  const [waiting, setWaiting] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [waitLoading, setWaitLoading] = useState(false);
  const waitIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showTollModal, setShowTollModal] = useState(false);
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

  useEffect(() => {
    let _socket: WebSocket | null = null;

    if (!ws) {
      const newWs = new WebSocket(WS_URL);

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
      alert("Phone number not available");
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

        {/* Multi-Stops */}
        {stops.length > 0 && (
          <View className="px-6 py-3">
            <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
              📍 Stops ({currentStopIdx + 1}/{stops.length + 1})
            </Text>
            {stops.map((stop: any, i: number) => (
              <View key={stop.id} className="flex-row items-center py-1">
                <Text className={`text-[13px] font-Jakarta ${
                  i < currentStopIdx ? 'text-goTextSecondaryLight dark:text-goTextSecondaryDark line-through' :
                  i === currentStopIdx ? 'text-goPrimary font-JakartaBold' :
                  'text-goTextSecondaryLight dark:text-goTextSecondaryDark'
                }`}>
                  {i + 1}. {stop.address}
                </Text>
              </View>
            ))}
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Final: {destinationAddress}</Text>
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
                className="bg-goPrimary rounded-full py-3 px-6 items-center mt-3"
              >
                <Text className="text-goWhite font-JakartaBold text-[15px]">✓ Complete Stop {currentStopIdx + 1}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

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
              <TouchableOpacity onPress={openNavigation}
                style={{ backgroundColor: colors.gray600, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill, marginRight: 8 }}>
                <Text style={{ color: colors.white, fontFamily: "Urbanist", fontWeight: "700", fontSize: 14 }}>🗺️ Nav</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openChat}
                style={{ backgroundColor: colors.gray600, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill }}>
                <Text style={{ color: colors.white, fontFamily: "Urbanist", fontWeight: "700", fontSize: 14 }}>💬 Chat</Text>
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
          <TouchableOpacity onPress={toggleWait} disabled={waitLoading}
            className={`mt-3 py-3 px-4 rounded-full items-center ${waiting ? "bg-goAmber" : "bg-goGray600 dark:bg-goSurfaceElevatedDark"}`}>
            {waitLoading ? <ActivityIndicator size={16} color="#FFF" /> : (
              <Text className="text-white font-JakartaBold text-[14px]">
                {waiting ? `⏱️ ${Math.floor(waitSeconds / 60)}:${String(waitSeconds % 60).padStart(2, '0')} — Stop` : '⏱️ Start Waiting Timer'}
              </Text>
            )}
          </TouchableOpacity>
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
    </RideLayout>
      <TollParkingModal visible={showTollModal} rideId={activeRideId} onClose={() => setShowTollModal(false)} />
    </Fragment>
  );
};

export default ReachCustomer;
