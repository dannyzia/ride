import { colors, spacing } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  TextInput,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useCustomer } from "@/store";
import { useRiderStore, VehicleType, getCachedEstimates, setCachedEstimates } from "@/store/useRiderStore";
import CustomButton from "@/components/CustomButton";
import SchedulePicker from "@/components/SchedulePicker";
import PreferenceChips from "@/components/PreferenceChips";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { icons } from "@/constants/data";

const VEHICLE_ICONS: Record<string, any> = {
  bike_basic: icons.cab,
  bike_standard: icons.cab,
  bike_plus: icons.cab,
  cng: icons.cab,
  car_economy: icons.cab,
  car_comfort: icons.cab,
  car_premium: icons.cab,
  car_xl: icons.cab,
};

const BookRidePage = () => {
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
    setSelectedVehicleType,
    estimates,
    setEstimates,
    estimating,
    setEstimating,
    scheduledAt,
    setScheduledAt,
    setPromoCode,
    setPromoDiscount,
    selectedPrefIds,
    setSelectedPrefIds,
  } = useRiderStore();
  const [error, setError] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoApplying, setPromoApplying] = useState(false);
  const [promoApplied, setPromoApplied] = useState(false);

  useEffect(() => {
    if (
      userLatitude &&
      userLongitude &&
      destinationLatitude &&
      destinationLongitude
    ) {
      fetchEstimates();
    }
  }, []);

  const fetchEstimates = async () => {
    setError(null);

    // Show cached estimates immediately for instant load
    if (
      userLatitude &&
      userLongitude &&
      destinationLatitude &&
      destinationLongitude
    ) {
      const cached = getCachedEstimates(
        userLatitude,
        userLongitude,
        destinationLatitude,
        destinationLongitude,
      );
      if (cached) {
        setEstimates(cached);
        return; // Background refresh not needed — data is still valid
      }
    }

    setEstimating(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const response = await fetch(`${API_URL}/api/ride/estimate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          preference_ids:
            selectedPrefIds.length > 0 ? selectedPrefIds : undefined,
          promo_code:
            promoApplied && promoInput ? promoInput.trim() : undefined,
        }),
      });
      const data = await response.json();
      if (data.estimates) {
        setEstimates(data.estimates);
        if (
          userLatitude &&
          userLongitude &&
          destinationLatitude &&
          destinationLongitude
        ) {
          setCachedEstimates(
            userLatitude,
            userLongitude,
            destinationLatitude,
            destinationLongitude,
            data.estimates,
          );
        }
      } else if (data.error) {
        setError(data.message || data.error);
      }
    } catch (_err) {
      setError("Failed to fetch estimates");
    } finally {
      setEstimating(false);
    }
  };

  const handleSelectVehicle = (vt: VehicleType) => {
    setSelectedVehicleType(vt);
    router.push("/(main)/(customer)/confirm-ride");
  };

  const renderEstimate = (item: any) => {
    const def = VEHICLE_TYPES.find((v) => v.key === item.vehicle_type);
    const selected = selectedVehicleType === item.vehicle_type;

    return (
      <TouchableOpacity
        key={item.vehicle_type}
        onPress={() => handleSelectVehicle(item.vehicle_type)}
        className={`flex-row items-center p-4 mb-3 rounded-2xl border ${
          selected
            ? "border-goAccent bg-goAccent/10"
            : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
        }`}
      >
        <View className="w-16 h-16 rounded-full bg-goLightGray dark:bg-goDarkSecondary items-center justify-center">
          <Image
            source={VEHICLE_ICONS[item.vehicle_type] || icons.cab}
            className="w-8 h-8 tint-goTextPrimaryLight dark:tint-goTextPrimaryDark"
            resizeMode="contain"
          />
        </View>
        <View className="flex-1 ml-4">
          <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-lg font-JakartaBold">
            {def?.display_en || item.vehicle_type}
          </Text>
          <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-sm">
            {item.seats} seats • {item.eta_minutes} min
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-lg font-JakartaBold">
            ৳{(item.total_bdt / 100).toFixed(0)}
          </Text>
          <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-xs">est.</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      {/* Header */}
      <View className="flex-row items-center px-5 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()} className="p-1">
          <Image
            source={icons.backArrow}
            className="w-6 h-6"
            resizeMode="contain"
          />
        </TouchableOpacity>
        <Text className="text-xl font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark ml-3">
          Choose Vehicle
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Pickup / destination summary */}
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Image
              source={icons.marker}
              className="w-4 h-4 tint-goAccent"
              resizeMode="contain"
            />
            <Text
              className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-sm font-JakartaMedium ml-2 flex-1"
              numberOfLines={1}
            >
              {userAddress || "Current location"}
            </Text>
          </View>
          <View className="flex-row items-center">
            <Image
              source={icons.pin}
              className="w-4 h-4 tint-goDanger"
              resizeMode="contain"
            />
            <Text
              className="text-goTextPrimaryLight dark:text-goTextPrimaryDark text-sm font-JakartaMedium ml-2 flex-1"
              numberOfLines={1}
            >
              {destinationAddress || "Destination"}
            </Text>
          </View>
        </View>

        {/* Schedule Picker */}
        <SchedulePicker
          selectedIndex={scheduledAt ? undefined : 0}
          onSelect={(iso, _option) => setScheduledAt(iso)}
        />

        {/* Promo Code Input */}
        <View style={{ marginBottom: spacing.md }}>
          <Text
            style={{
              fontFamily: "Urbanist",
              fontWeight: "600",
              fontSize: 13,
              color: colors.textSecondaryLight,
              marginBottom: spacing.sm,
            }}
          >
            Promo Code
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={promoInput}
              onChangeText={(t) => {
                setPromoInput(t.toUpperCase());
                setPromoApplied(false);
              }}
              placeholder="Enter code"
              placeholderTextColor={colors.textDisabledLight}
              editable={!promoApplied}
              autoCapitalize="characters"
              style={{
                flex: 1,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: promoApplied ? colors.primary : colors.borderLight,
                backgroundColor: colors.surfaceLight,
                paddingHorizontal: 14,
                fontFamily: "Inter",
                fontSize: 14,
                color: colors.textPrimaryLight,
              }}
            />
            {promoApplied ? (
              <TouchableOpacity
                onPress={() => {
                  setPromoCode(null);
                  setPromoDiscount(0);
                  setPromoInput("");
                  setPromoApplied(false);
                }}
                style={{
                  height: 44,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  backgroundColor: colors.danger + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Inter",
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.danger,
                  }}
                >
                  Remove
                </Text>
              </TouchableOpacity>
            ) : (
              <CustomButton
                title={promoApplying ? "..." : "Apply"}
                onPress={async () => {
                  if (!promoInput.trim() || !userLatitude || !userLongitude)
                    return;
                  setPromoApplying(true);
                  try {
                    const {
                      data: { session },
                    } = await supabase.auth.getSession();
                    const token = session?.access_token ?? "";
                    const res = await fetch(`${API_URL}/api/promo/redeem`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(token ? { Authorization: `Bearer ${token}` } : {}),
                      },
                      body: JSON.stringify({
                        code: promoInput.trim(),
                        vehicle_type: selectedVehicleType ?? "bike_basic",
                        pickup_lat: userLatitude,
                        pickup_lng: userLongitude,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok && data.status === "valid") {
                      setPromoCode(promoInput.trim());
                      // We'll compute actual discount on confirm; stage is set server-side
                      setPromoApplied(true);
                    } else {
                      Alert.alert(
                        "Invalid Promo",
                        data.error || "Could not apply promo code",
                      );
                    }
                  } catch {
                    Alert.alert("Error", "Network error");
                  } finally {
                    setPromoApplying(false);
                  }
                }}
                disabled={!promoInput.trim() || promoApplying}
                className="w-24"
              />
            )}
          </View>
          {promoApplied && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  color: colors.primary,
                }}
              >
                ✓ Promo code applied
              </Text>
            </View>
          )}
        </View>

        {/* Preference Chips */}
        <PreferenceChips
          selectedIds={selectedPrefIds}
          onChange={(ids) => setSelectedPrefIds(ids)}
        />

        {estimating ? (
          <View className="items-center justify-center py-10">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-3">
              Finding available vehicles...
            </Text>
          </View>
        ) : error ? (
          <View className="items-center justify-center py-10">
            <Text className="text-goDanger text-base mb-4">{error}</Text>
            <CustomButton
              title="Retry"
              onPress={fetchEstimates}
              className="w-40"
            />
          </View>
        ) : estimates.length > 0 ? (
          <View>{estimates.map((item: any) => renderEstimate(item))}</View>
        ) : (
          <View className="items-center justify-center py-10">
            <Text className="text-goTextSecondaryLight dark:text-goTextSecondaryDark text-base">
              No vehicles available for this route
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default BookRidePage;
