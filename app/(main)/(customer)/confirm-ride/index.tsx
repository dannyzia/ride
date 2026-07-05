import { Image, Text, View, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import RideLayout from "@/components/RideLayout";
import { useCustomer } from "@/store";
import { icons } from "@/constants/data";
import { useRouter } from "expo-router";
import CustomButton from "@/components/CustomButton";
import { useEffect, useState } from "react";
import { useRiderStore } from "@/store/useRiderStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";

const API_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "";
const BARIKOI_API_KEY = process.env.EXPO_PUBLIC_BARIKOI_API_KEY ?? "";

const ConfirmRidePage = () => {
  const router = useRouter();
  const {
    userAddress,
    destinationAddress,
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
  } = useCustomer();
  const {
    selectedVehicleType,
    estimates,
    setActiveRide,
    setSearchingRideId,
    setRideStatus,
    scheduledAt,
    promoCode,
    selectedPrefIds,
  } = useRiderStore();
  const [rideDuration, setRideDuration] = useState<string>("");
  const [rideDistance, setRideDistance] = useState<string>("");
  const [requesting, setRequesting] = useState(false);

  const selectedEstimate = estimates.find(
    (e) => e.vehicle_type === selectedVehicleType,
  );
  const vehicleDef = selectedVehicleType
    ? VEHICLE_TYPES.find((v) => v.key === selectedVehicleType)
    : null;

  useEffect(() => {
    if (
      !userLongitude ||
      !userLatitude ||
      !destinationLongitude ||
      !destinationLatitude
    )
      return;

    const fetchRoute = async () => {
      try {
        const url = `https://barikoi.xyz/v1/api/distance/directions/${BARIKOI_API_KEY}?from=${userLongitude},${userLatitude}&to=${destinationLongitude},${destinationLatitude}`;
        const response = await fetch(url);
        const data = await response.json();
        const seconds = data.duration || data.routes?.[0]?.duration || 0;
        const meters = data.distance || data.routes?.[0]?.distance || 0;

        const timeInMinutes = Math.round((seconds + 300) / 60);
        const duration =
          timeInMinutes < 60
            ? `${timeInMinutes} mins`
            : `${(timeInMinutes / 60).toFixed(1)} hours`;

        const km = meters / 1000;
        const distance =
          km >= 1 ? `${km.toFixed(1)} km` : `${Math.round(meters)} m`;

        setRideDuration(duration);
        setRideDistance(distance);
      } catch {
        setRideDuration(
          selectedEstimate ? `${selectedEstimate.eta_minutes} min` : "N/A",
        );
        setRideDistance(
          selectedEstimate
            ? `${selectedEstimate.distance_km.toFixed(1)} km`
            : "N/A",
        );
      }
    };

    fetchRoute();
  }, []);

  const handleRequestRide = async () => {
    if (
      !userLatitude ||
      !userLongitude ||
      !destinationLatitude ||
      !destinationLongitude ||
      !selectedVehicleType
    ) {
      Alert.alert("Error", "Missing location or vehicle type");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      Alert.alert("Error", "Not authenticated");
      return;
    }

    setRequesting(true);
    try {
      const response = await fetch(`${API_URL}/api/ride/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          pickup_address: userAddress || "",
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          dropoff_address: destinationAddress || "",
          vehicle_type: selectedVehicleType,
          scheduled_at: scheduledAt || undefined,
          promo_code: promoCode || undefined,
          preference_ids:
            selectedPrefIds.length > 0 ? selectedPrefIds : undefined,
        }),
      });
      const data = await response.json();
      if (data.ride_id) {
        // Seed activeRide with the ride details + fare so the tracking screen
        // (final-page) can render the fare, pickup/dropoff, etc. immediately —
        // previously activeRide was never set, so the rider saw no fare and a
        // blank ride card.
        setActiveRide({
          id: data.ride_id,
          status: "pending",
          driver_id: null,
          origin_address: userAddress || "",
          destination_address: destinationAddress || "",
          origin_latitude: userLatitude ?? 0,
          origin_longitude: userLongitude ?? 0,
          destination_latitude: destinationLatitude ?? 0,
          destination_longitude: destinationLongitude ?? 0,
          vehicle_type: selectedVehicleType ?? "bike_basic",
          fare_breakdown: data.fare_breakdown ?? {},
          distance_km: data.fare_breakdown?.distance_km ?? 0,
          created_at: new Date().toISOString(),
        });
        setSearchingRideId(data.ride_id);
        setRideStatus("finding");
        router.replace("/(main)/(customer)/final-page");
      } else {
        Alert.alert(
          "Request Failed",
          data.message || data.error || "Could not find a driver",
        );
      }
    } catch (err: any) {
      Alert.alert("Error", err.message || "Network error");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <RideLayout title="Confirm Ride" disabled={false}>
      <View className="flex-1">
        {/* Selected vehicle info */}
        {selectedEstimate && vehicleDef && (
          <View className="flex-row items-center p-4 mb-5 rounded-2xl bg-cardBgColor">
            <View className="w-16 h-16 rounded-full bg-bgColor items-center justify-center">
              <Image
                source={icons.cab}
                className="w-8 h-8 tint-primaryTextColor"
                resizeMode="contain"
              />
            </View>
            <View className="flex-1 ml-4">
              <Text className="text-primaryTextColor text-lg font-JakartaBold">
                {vehicleDef.display_en}
              </Text>
              <Text className="text-secondaryTextColor text-sm">
                {selectedEstimate.seats} seats
              </Text>
            </View>
            <View className="items-end">
              <Text className="text-primaryTextColor text-lg font-JakartaBold">
                ৳{(selectedEstimate.total_bdt / 100).toFixed(0)}
              </Text>
              <Text className="text-secondaryTextColor text-xs">
                {selectedEstimate.eta_minutes} min
              </Text>
            </View>
          </View>
        )}

        {/* Ride info card */}
        <View className="rounded-2xl bg-cardBgColor p-4 mb-5">
          {/* Scheduled time badge */}
          {scheduledAt && (
            <View className="flex-row items-center py-2 border-b border-borderColor">
              <MaterialIcons name="schedule" size={16} color={colors.primary} />
              <Text className="text-secondaryTextColor ml-2">Pickup at</Text>
              <View
                className="ml-auto px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: colors.primaryLight }}
              >
                <Text
                  style={{
                    fontFamily: "Inter",
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.primary,
                  }}
                >
                  {new Date(scheduledAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
                </Text>
              </View>
            </View>
          )}
          <View className="flex-row justify-between py-2 border-b border-borderColor">
            <Text className="text-secondaryTextColor">Distance</Text>
            <Text className="text-primaryTextColor font-JakartaSemiBold">
              {rideDistance}
            </Text>
          </View>
          <View className="flex-row justify-between py-2 border-b border-borderColor">
            <Text className="text-secondaryTextColor">Duration</Text>
            <Text className="text-primaryTextColor font-JakartaSemiBold">
              {rideDuration}
            </Text>
          </View>
          {promoCode && (
            <View className="flex-row justify-between py-2 border-b border-borderColor">
              <View className="flex-row items-center">
                <MaterialIcons
                  name="local-offer"
                  size={14}
                  color={colors.primary}
                />
                <Text className="text-secondaryTextColor ml-1.5">
                  Promo ({promoCode})
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 14,
                  fontWeight: "600",
                  color: colors.primary,
                }}
              >
                −৳0
              </Text>
            </View>
          )}
          <View className="flex-row justify-between py-2">
            <Text className="text-secondaryTextColor">Fare</Text>
            <Text className="text-goAccent text-lg font-JakartaBold">
              ৳
              {selectedEstimate
                ? (selectedEstimate.total_bdt / 100).toFixed(0)
                : "—"}
            </Text>
          </View>
        </View>

        {/* Pickup / Dropoff */}
        <View className="rounded-2xl bg-cardBgColor p-4 mb-5">
          <View className="flex-row items-center py-2 border-b border-borderColor">
            <Image
              source={icons.marker}
              className="w-5 h-5 tint-goAccent"
              resizeMode="contain"
            />
            <Text
              className="text-primaryTextColor ml-3 flex-1"
              numberOfLines={2}
            >
              {userAddress || "Pickup"}
            </Text>
          </View>
          <View className="flex-row items-center py-2">
            <Image
              source={icons.pin}
              className="w-5 h-5 tint-danger-500"
              resizeMode="contain"
            />
            <Text
              className="text-primaryTextColor ml-3 flex-1"
              numberOfLines={2}
            >
              {destinationAddress || "Dropoff"}
            </Text>
          </View>
        </View>

        <CustomButton
          title={requesting ? "Requesting..." : "Request Ride"}
          onPress={handleRequestRide}
          disabled={requesting || !selectedVehicleType}
          className="w-full mt-auto"
        />
      </View>
    </RideLayout>
  );
};

export default ConfirmRidePage;
