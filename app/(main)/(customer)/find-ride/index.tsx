import { colors, fonts } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  StatusBar,
  StyleSheet,
} from "react-native";
import type { ImageSourcePropType } from "react-native";
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
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

type Stop = { lat: number; lng: number; address: string };
const MAX_STOPS = 2;

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

// ── Vehicle category grouping ────────────────────────────────────
type Category = "bike" | "cng" | "car";
const CATEGORY_META: Record<Category, { label: string; icon: IoniconName; prefix: string }> = {
  bike: { label: "Bike", icon: "bicycle", prefix: "bike_" },
  cng: { label: "CNG", icon: "car", prefix: "cng" },
  car: { label: "Car", icon: "car-sport", prefix: "car_" },
};
const CATEGORY_ORDER: Category[] = ["bike", "cng", "car"];

const VEHICLE_ICONS: Record<string, ImageSourcePropType> = {
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
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
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
  const [locating, setLocating] = useState(false);

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
    // Always fetch a fresh GPS fix when the user explicitly taps the button.
    logger.info("[find-ride] useCurrentLocation TAPPED");
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      logger.info("[find-ride] permission status:", status);
      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to request a ride.",
        );
        return;
      }

      // Race getCurrentPositionAsync against an 8-second timeout so the
      // spinner never hangs forever (common when indoors with no GPS fix).
      let loc: Location.LocationObject | null = null;
      try {
        loc = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), 8000),
          ),
        ]);
      } catch (e) {
        logger.warn("[find-ride] getCurrentPositionAsync threw:", e);
      }

      // Fallback: use last known position if fresh fix failed/timed out
      if (!loc) {
        logger.info("[find-ride] trying last known position fallback");
        loc = await Location.getLastKnownPositionAsync();
      }

      if (!loc) {
        Alert.alert(
          "Location Unavailable",
          "Could not get your location. Make sure GPS/Location is enabled in your device settings and try again outside.",
        );
        return;
      }

      logger.info("[find-ride] GPS fix:", loc.coords.latitude, loc.coords.longitude);
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        address: `${loc.coords.latitude.toFixed(4)}, ${loc.coords.longitude.toFixed(4)}`,
      });
    } catch (_e) {
      logger.warn("[find-ride] GPS error:", _e instanceof Error ? _e.message : _e);
      Alert.alert(
        "GPS Unavailable",
        "Could not get your location. Make sure GPS is enabled and try again.",
      );
    } finally {
      setLocating(false);
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
            borderColor: selected ? colors.primary : borderColor,
            backgroundColor: selected
              ? isDark
                ? colors.primaryLightDark
                : colors.primaryLight
              : surfaceBg,
          },
        ]}
      >
        <Image
          source={VEHICLE_ICONS[item.vehicle_type] || icons.cab}
          style={{
            width: 32,
            height: 32,
            tintColor: selected ? colors.primary : textPrimary,
          }}
          resizeMode="contain"
        />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={[styles.estimateName, { color: textPrimary }]}>
            {def?.display_en || item.vehicle_type}
          </Text>
          <Text style={[styles.estimateSub, { color: textSecondary }]}>
            {item.seats} seats • {item.eta_minutes} min away
          </Text>
        </View>
        <Text style={[styles.estimatePrice, { color: textPrimary }]}>
          ৳{(item.total_bdt / 100).toFixed(0)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <RideLayout title="Plan Ride" disabled={false} snapPoints={["50%", "90%"]}>
        <View style={{ flex: 1 }}>
          <BottomSheetScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            contentContainerStyle={{ paddingBottom: 150 }}
          >
            {/* Pickup */}
            <Text style={[styles.sectionLabel, { color: textPrimary }]}>Pickup</Text>
            <TouchableOpacity
              onPress={useCurrentLocation}
              style={[
                styles.currentLocationBtn,
                { backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight },
              ]}
              disabled={locating}
            >
              {locating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="locate-outline" size={16} color={colors.primary} />
              )}
              <Text style={styles.currentLocationText}>
                {locating
                  ? "Getting your location..."
                  : userLatitude
                    ? "Use Current Location"
                    : "Get My Location"}
              </Text>
            </TouchableOpacity>
            <BarikoiAutocomplete
              icon={icons.target}
              initialLocation={fromLabel}
              textInputBackgroundColor={surfaceBg}
              handlePress={(location) => setUserLocation(location)}
            />

            {/* Inline stops */}
            {stops.map((stop, i) => (
              <View key={`stop-${i}`} style={styles.stopBlock}>
                <View style={styles.stopHeader}>
                  <Text style={[styles.sectionLabel, { color: textPrimary }]}>Stop {i + 1}</Text>
                  <TouchableOpacity
                    onPress={() => removeStop(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={16} color={colors.danger} />
                  </TouchableOpacity>
                </View>
                <BarikoiAutocomplete
                  icon={icons.point}
                  initialLocation={stop.address}
                  textInputBackgroundColor={surfaceBg}
                  handlePress={(location) => updateStop(i, location)}
                />
              </View>
            ))}

            {stops.length < MAX_STOPS && (
              <TouchableOpacity onPress={addStop} style={styles.addStopBtn}>
                <Ionicons name="add" size={18} color={colors.primary} />
                <Text style={styles.addStopText}>Add Stop</Text>
              </TouchableOpacity>
            )}

            {/* Destination */}
            <Text style={[styles.sectionLabel, { color: textPrimary, marginTop: 8 }]}>Destination</Text>
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
            <Text style={[styles.sectionLabel, { color: textPrimary, marginTop: 8 }]}>Choose a ride</Text>
            {estimating ? (
              <View style={styles.centerBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.mutedText, { color: textSecondary }]}>
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
                              : borderColor,
                            backgroundColor: active
                              ? isDark
                                ? colors.primaryLightDark
                                : colors.primaryLight
                              : surfaceBg,
                          },
                        ]}
                      >
                        <Ionicons
                          name={meta.icon}
                          size={24}
                          color={active ? colors.primary : textPrimary}
                        />
                        <Text
                          style={[
                            styles.categoryLabel,
                            {
                              color: active
                                ? colors.primary
                                : textPrimary,
                            },
                          ]}
                        >
                          {meta.label}
                        </Text>
                        <Text style={[styles.categoryPrice, { color: textPrimary }]}>
                          ৳{(cheapest / 100).toFixed(0)}
                        </Text>
                        <Text style={[styles.categoryEta, { color: textSecondary }]}>{fastest} min</Text>
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
                <Text style={[styles.mutedText, { color: textSecondary }]}>
                  No vehicles available for this route
                </Text>
              </View>
            ) : (
              <View style={styles.centerBox}>
                <Text style={[styles.mutedText, { color: textSecondary }]}>
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
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionLabel: {
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
    marginTop: 2,
  },
  categoryEta: {
    fontFamily: fonts.body,
    fontSize: 11,
    marginTop: 1,
  },
  estimateName: {
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  estimateSub: {
    fontFamily: fonts.body,
    fontSize: 13,
    marginTop: 2,
  },
  estimatePrice: {
    fontFamily: fonts.heading,
    fontSize: 16,
  },
  centerBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  mutedText: {
    fontFamily: fonts.body,
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
});

export default PlanRidePage;
