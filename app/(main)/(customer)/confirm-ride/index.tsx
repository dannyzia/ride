import { Image, Text, View, TextInput, TouchableOpacity, Alert } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import RideLayout from "@/components/RideLayout";
import { useCustomer } from "@/store";
import { icons } from "@/constants/data";
import { useRouter } from "expo-router";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import { UpfrontTipSlider } from "@/components/UpfrontTipSlider";
import CustomButton from "@/components/CustomButton";
import { useEffect, useState, Fragment } from "react";
import { Modal } from "react-native";
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
  const [bookForOther, setBookForOther] = useState(false);
  const [otherName, setOtherName] = useState("");
  const [otherPhone, setOtherPhone] = useState("");
  const [upfrontTip, setUpfrontTip] = useState(0);
  const [stops, setStops] = useState<{ lat: number; lng: number; address: string }[]>([]);
  const [showStopModal, setShowStopModal] = useState(false);
  const [preferFemale, setPreferFemale] = useState(false);

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

    if (bookForOther && (!otherName.trim() || !otherPhone.trim())) {
      Alert.alert("Validation", "Please enter the passenger's name and phone number");
      setRequesting(false);
      return;
    }
    setRequesting(true);
    try {
      const endpoint = scheduledAt ? `${API_URL}/api/ride/schedule` : `${API_URL}/api/ride/request`;
      const response = await fetch(endpoint, {
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
          secondary_rider_name: bookForOther ? otherName.trim() : undefined,
          secondary_rider_phone: bookForOther ? otherPhone.trim() : undefined,
          upfront_tip_bdt: upfrontTip > 0 ? upfrontTip * 100 : undefined,
          stops: stops.length > 0 ? stops : undefined,
          female_driver_preference: preferFemale ? true : undefined,
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
    <Fragment>
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

        {/* Surge notice */}
        {(selectedEstimate as any)?.fare_breakdown?.surge_multiplier > 1.0 && (
          <View className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-[10px] px-[16px] py-[12px] mb-4">
            <Text className="text-[14px] font-JakartaBold text-yellow-700 dark:text-yellow-400">
              ⚡ High Demand — {(selectedEstimate as any).fare_breakdown.surge_multiplier}× pricing active
            </Text>
            <Text className="text-[13px] font-Jakarta text-yellow-600 dark:text-yellow-500">
              Includes ৳{(((selectedEstimate as any)?.fare_breakdown?.surge_fee_bdt ?? 0) / 100).toFixed(0)} surge fee
            </Text>
          </View>
        )}

        {/* Book for someone else */}
        <TouchableOpacity
          onPress={() => setBookForOther(!bookForOther)}
          className="flex-row items-center mb-3"
        >
          <View className={`w-5 h-5 rounded border-2 items-center justify-center mr-2 ${bookForOther ? "bg-goPrimary border-goPrimary" : "border-goBorderLight dark:border-goBorderDark"}`}>
            {bookForOther && <Text className="text-[12px] text-goWhite">✓</Text>}
          </View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Book for someone else</Text>
        </TouchableOpacity>
        {bookForOther && (
          <View className="mb-4">
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[12px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-3"
              placeholder="Passenger name" placeholderTextColor="#9CA3AF" value={otherName} onChangeText={setOtherName} />
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[12px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
              placeholder="01XXXXXXXXX" placeholderTextColor="#9CA3AF" keyboardType="numeric" value={otherPhone} onChangeText={setOtherPhone} />
          </View>
        )}

        <UpfrontTipSlider value={upfrontTip} onChange={setUpfrontTip} />

        {/* Female driver preference */}
        <TouchableOpacity onPress={() => setPreferFemale(!preferFemale)} className="flex-row items-center mb-3">
          <View className={`w-5 h-5 rounded border-2 items-center justify-center mr-2 ${preferFemale ? "bg-goPrimary border-goPrimary" : "border-goBorderLight dark:border-goBorderDark"}`}>
            {preferFemale && <Text className="text-[12px] text-goWhite">✓</Text>}
          </View>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Prefer female driver</Text>
        </TouchableOpacity>

        {stops.length < 2 && (
          <TouchableOpacity onPress={() => setShowStopModal(true)} className="flex-row items-center py-3 mb-2">
            <Text className="text-goPrimary font-Jakarta text-[15px]">➕ Add Stop</Text>
          </TouchableOpacity>
        )}
        {stops.map((stop, i) => (
          <View key={i} className="flex-row items-center bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-lg px-4 py-3 mb-2">
            <Text className="flex-1 text-[14px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Stop {i + 1}: {stop.address}</Text>
            <TouchableOpacity onPress={() => setStops(stops.filter((_, j) => j !== i))}><Text className="text-goDanger text-[14px]">✕</Text></TouchableOpacity>
          </View>
        ))}

        <CustomButton
          title={requesting ? "Requesting..." : "Request Ride"}
          onPress={handleRequestRide}
          disabled={requesting || !selectedVehicleType}
          className="w-full mt-auto"
        />
      </View>
    </RideLayout>
      <Modal visible={showStopModal} transparent animationType="slide" onRequestClose={() => setShowStopModal(false)}>
      <View className="flex-1 bg-goBgLight dark:bg-goBgDark pt-20 px-6">
        <View className="flex-row items-center mb-4">
          <TouchableOpacity onPress={() => setShowStopModal(false)}><Text className="text-goPrimary font-Jakarta text-base">Cancel</Text></TouchableOpacity>
          <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Add Stop</Text>
          <View className="w-12" />
        </View>
        <BarikoiAutocomplete
          icon={undefined}
          initialLocation=""
          textInputBackgroundColor="#F8FAFC"
          handlePress={(location: any) => {
            if (stops.length < 2) {
              setStops([...stops, { lat: location.latitude, lng: location.longitude, address: location.address }]);
              setShowStopModal(false);
            }
          }}
        />
      </View>
      </Modal>
    </Fragment>
  );
};

export default ConfirmRidePage;
