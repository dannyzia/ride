import { colors, fonts } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import React, { useCallback, useEffect, useState } from "react";
import RideLayout from "@/components/RideLayout";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import { icons } from "@/constants/data";
import CustomButton from "@/components/CustomButton";
import { useRouter } from "expo-router";
import { useCustomer } from "@/store";
import {
  useRiderStore,
  FareEstimate,
  getCachedEstimates,
  setCachedEstimates,
} from "@/store/useRiderStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { MaterialIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";

type Stop = { lat: number; lng: number; address: string };
const MAX_STOPS = 2;

// ── Vehicle category grouping ────────────────────────────────────
type Category = "bike" | "cng" | "car";
const CATEGORY_META: Record<Category, { label: string; icon: string; prefix: string }> = {
  bike: { label: "Bike", icon: "two-wheeler", prefix: "bike_" },
  cng: { label: "CNG", icon: "local-taxi", prefix: "cng" },
  car: { label: "Car", icon: "directions-car", prefix: "car_" },
};
const CATEGORY_ORDER: Category[] = ["bike", "cng", "car"];

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

const PlanRidePage = () => {
  const router = useRouter();
  const {
    userAddress,
    userLatitude,
    userLongitude,
    destinationAddress,
    destinationLatitude,
    destinationLongitude,
    setUserLocation,
    setDestinationLocation,
  } = useCustomer();
  const {
    selectedVehicleType,
    setSelectedVehicleType,
    estimates,
    setEstimates,
    estimating,
    setEstimating,
    setStops,
  } = useRiderStore();

  const [stops, setLocalStops] = useState<Stop[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const hasRoute = !!(
    userLatitude &&
    userLongitude &&
    destinationLatitude &&
    destinationLongitude
  );

  const fromLabel = userAddress
    ? userAddress.length > 49
      ? userAddress.slice(0, 49) + "..."
      : userAddress
    : userLatitude
      ? `${userLatitude.toFixed(4)}, ${(userLongitude ?? 0).toFixed(4)}`
      : "Enter or choose location";

  const fetchEstimates = useCallback(async () => {
    if (!userLatitude || !userLongitude || !destinationLatitude || !destinationLongitude) {
      return;
    }
    setError(null);

    const cached = getCachedEstimates(
      userLatitude,
      userLongitude,
      destinationLatitude,
      destinationLongitude,
    );
    if (cached) {
      setEstimates(cached);
      return;
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
        }),
      });
      const data = await response.json();
      if (data.estimates) {
        setEstimates(data.estimates);
        setCachedEstimates(
          userLatitude,
          userLongitude,
          destinationLatitude,
          destinationLongitude,
          data.estimates,
        );
      } else if (data.error) {
        setError(data.message || data.error);
      }
    } catch (_err) {
      setError("Failed to fetch estimates");
    } finally {
      setEstimating(false);
    }
  }, [
    userLatitude,
    userLongitude,
    destinationLatitude,
    destinationLongitude,
    setEstimates,
    setEstimating,
  ]);

  useEffect(() => {
    if (hasRoute) {
      fetchEstimates();
    } else {
      setEstimates([]);
      setSelectedVehicleType(null);
    }
  }, [hasRoute, fetchEstimates, setEstimates, setSelectedVehicleType]);

  const addStop = () => {
    if (stops.length < MAX_STOPS) {
      setLocalStops([...stops, { lat: 0, lng: 0, address: "" }]);
    }
  };

  const updateStop = (
    index: number,
    location: { latitude: number; longitude: number; address: string },
  ) => {
    const next = [...stops];
    next[index] = {
      lat: location.latitude,
      lng: location.longitude,
      address: location.address,
    };
    setLocalStops(next);
  };

  const removeStop = (index: number) => {
    setLocalStops(stops.filter((_, j) => j !== index));
  };

  const useCurrentLocation = async () => {
    if (userLatitude != null && userLongitude != null) {
      return;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to request a ride.",
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address: `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`,
      });
    } catch (_e) {
      Alert.alert(
        "GPS Unavailable",
        "Could not get your location. Make sure GPS is enabled and try again.",
      );
    }
  };

  const handleConfirm = () => {
    setStops(stops.filter((s) => s.address.length > 0));
    router.push("/(main)/(customer)/confirm-ride");
  };

  const canConfirm = !!(hasRoute && selectedVehicleType);

  const renderEstimate = (item: FareEstimate) => {
    const def = VEHICLE_TYPES.find((v) => v.key === item.vehicle_type);
    const selected = selectedVehicleType === item.vehicle_type;
    return (
      <TouchableOpacity
        key={item.vehicle_type}
        onPress={() => setSelectedVehicleType(item.vehicle_type)}
        style={[
          styles.estimateCard,
          {
            borderColor: selected ? colors.primary : colors.borderDark,
            backgroundColor: selected
              ? colors.primary + "26"
              : colors.darkTabBar,
          },
        ]}
      >
        <Image
          source={VEHICLE_ICONS[item.vehicle_type] || icons.cab}
          style={{
            width: 32,
            height: 32,
            tintColor: selected ? colors.primary : colors.textPrimaryDark,
          }}
          resizeMode="contain"
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.estimateName}>
            {def?.display_en || item.vehicle_type}
          </Text>
          <Text style={styles.estimateSub}>
            {item.seats} seats • {item.eta_minutes} min away
          </Text>
        </View>
        <Text style={styles.estimatePrice}>
          ৳{(item.total_bdt / 100).toFixed(0)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <RideLayout title="Plan Ride" disabled={false} snapPoints={["50%", "90%"]}>
        <View style={{ flex: 1 }}>
          <BottomSheetScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            {/* Pickup */}
            <Text style={styles.sectionLabel}>Pickup</Text>
            <TouchableOpacity
              onPress={useCurrentLocation}
              style={styles.currentLocationBtn}
            >
              <MaterialIcons name="my-location" size={16} color={colors.primary} />
              <Text style={styles.currentLocationText}>
                {userLatitude ? "Use Current Location" : "Get My Location"}
              </Text>
            </TouchableOpacity>
            <BarikoiAutocomplete
              icon={icons.target}
              initialLocation={fromLabel}
              textInputBackgroundColor={colors.gray100}
              handlePress={(location) => setUserLocation(location)}
            />

            {/* Inline stops */}
            {stops.map((stop, i) => (
              <View key={`stop-${i}`} style={styles.stopBlock}>
                <View style={styles.stopHeader}>
                  <Text style={styles.sectionLabel}>Stop {i + 1}</Text>
                  <TouchableOpacity
                    onPress={() => removeStop(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeStop}>✕</Text>
                  </TouchableOpacity>
                </View>
                <BarikoiAutocomplete
                  icon={icons.point}
                  initialLocation={stop.address}
                  textInputBackgroundColor={colors.gray100}
                  handlePress={(location) => updateStop(i, location)}
                />
              </View>
            ))}

            {stops.length < MAX_STOPS && (
              <TouchableOpacity onPress={addStop} style={styles.addStopBtn}>
                <MaterialIcons name="add" size={18} color={colors.primary} />
                <Text style={styles.addStopText}>Add Stop</Text>
              </TouchableOpacity>
            )}

            {/* Destination */}
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Destination</Text>
            <BarikoiAutocomplete
              icon={icons.pin}
              initialLocation={
                destinationAddress && destinationAddress.length > 49
                  ? destinationAddress.slice(0, 49) + "..."
                  : destinationAddress || "Enter Destination"
              }
              textInputBackgroundColor="transparent"
              handlePress={(location) => setDestinationLocation(location)}
            />

            {/* Vehicle estimates */}
            <Text style={[styles.sectionLabel, { marginTop: 8 }]}>Choose a ride</Text>
            {estimating ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.mutedText}>
                  Finding available vehicles...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.centerBox}>
                <Text style={{ color: colors.danger, marginBottom: 12 }}>
                  {error}
                </Text>
                <CustomButton
                  title="Retry"
                  onPress={fetchEstimates}
                  className="w-40"
                />
              </View>
            ) : estimates.length > 0 ? (
              <View style={{ marginTop: 4 }}>
                {/* Category tabs */}
                <View style={styles.categoryRow}>
                  {CATEGORY_ORDER.map((cat) => {
                    const meta = CATEGORY_META[cat];
                    const catEstimates = estimates.filter((e) =>
                      e.vehicle_type.startsWith(meta.prefix),
                    );
                    if (catEstimates.length === 0) return null;
                    const cheapest = Math.min(
                      ...catEstimates.map((e) => e.total_bdt),
                    );
                    const fastest = Math.min(
                      ...catEstimates.map((e) => e.eta_minutes),
                    );
                    const active = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        onPress={() =>
                          setSelectedCategory(active ? null : cat)
                        }
                        style={[
                          styles.categoryTab,
                          {
                            borderColor: active
                              ? colors.primary
                              : colors.borderDark,
                            backgroundColor: active
                              ? colors.primary + "26"
                              : colors.darkTabBar,
                          },
                        ]}
                      >
                        <MaterialIcons
                          name={meta.icon as any}
                          size={24}
                          color={active ? colors.primary : colors.textPrimaryDark}
                        />
                        <Text
                          style={[
                            styles.categoryLabel,
                            {
                              color: active
                                ? colors.primary
                                : colors.textPrimaryDark,
                            },
                          ]}
                        >
                          {meta.label}
                        </Text>
                        <Text style={styles.categoryPrice}>
                          ৳{(cheapest / 100).toFixed(0)}
                        </Text>
                        <Text style={styles.categoryEta}>{fastest} min</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Sub-types for selected category */}
                {selectedCategory &&
                  estimates
                    .filter((e) =>
                      e.vehicle_type.startsWith(
                        CATEGORY_META[selectedCategory].prefix,
                      ),
                    )
                    .map(renderEstimate)}
              </View>
            ) : hasRoute ? (
              <View style={styles.centerBox}>
                <Text style={styles.mutedText}>
                  No vehicles available for this route
                </Text>
              </View>
            ) : (
              <View style={styles.centerBox}>
                <Text style={styles.mutedText}>
                  Set pickup and destination to see fares
                </Text>
              </View>
            )}
          </BottomSheetScrollView>

          <View style={{ paddingTop: 8 }}>
            <CustomButton
              title="Confirm Ride"
              onPress={handleConfirm}
              disabled={!canConfirm}
              className="w-full"
            />
          </View>
        </View>
      </RideLayout>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionLabel: {
    color: colors.textPrimaryDark,
    fontFamily: fonts.headingSemi,
    fontSize: 15,
    marginBottom: 8,
  },
  currentLocationBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.primary + "1A",
    alignSelf: "flex-start",
  },
  currentLocationText: {
    marginLeft: 8,
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
  },
  stopBlock: {
    marginBottom: 4,
  },
  stopHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  removeStop: {
    color: colors.danger,
    fontSize: 16,
    paddingHorizontal: 4,
  },
  addStopBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },
  addStopText: {
    marginLeft: 6,
    color: colors.primary,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  estimateCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  categoryTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  categoryLabel: {
    fontFamily: fonts.headingSemi,
    fontSize: 14,
    marginTop: 6,
  },
  categoryPrice: {
    fontFamily: fonts.heading,
    fontSize: 15,
    color: colors.textPrimaryDark,
    marginTop: 2,
  },
  categoryEta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondaryDark,
    marginTop: 1,
  },
  estimateName: {
    color: colors.textPrimaryDark,
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  estimateSub: {
    color: colors.textSecondaryDark,
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
  estimatePrice: {
    color: colors.textPrimaryDark,
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  mutedText: {
    color: colors.textSecondaryDark,
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});

export default PlanRidePage;
