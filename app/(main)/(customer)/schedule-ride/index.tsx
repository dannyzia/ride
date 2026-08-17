import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useCustomer } from "@/store";
import { useRiderStore } from "@/store/useRiderStore";
import { VEHICLE_TYPES, VehicleTypeEnum } from "@/lib/vehicleTypes";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import { icons } from "@/constants/data";

const MIN_LEAD_MS = 30 * 60 * 1000;
const MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

export default function ScheduleRide() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const {
    userLatitude,
    userLongitude,
    userAddress,
    destinationLatitude,
    destinationLongitude,
    destinationAddress,
    setUserLocation,
    setDestinationLocation,
  } = useCustomer();
  const { selectedVehicleType: storeVehicleType } = useRiderStore();

  const [vehicleType, setVehicleType] = useState<VehicleTypeEnum>(
    (storeVehicleType as VehicleTypeEnum | null) ?? VEHICLE_TYPES[0].key,
  );
  const [scheduledAt, setScheduledAt] = useState<Date | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default: one hour out, rounded up to the next half-hour — always inside
  // the server's [now + 30 min, now + 7 days] window by construction.
  useEffect(() => {
    if (scheduledAt) return;
    const t = new Date(Date.now() + 60 * 60 * 1000);
    t.setMinutes(Math.ceil(t.getMinutes() / 30) * 30, 0, 0);
    setScheduledAt(t);
  }, [scheduledAt]);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const hasPickup = !!userLatitude && !!userLongitude && !!userAddress;
  const hasDropoff =
    !!destinationLatitude && !!destinationLongitude && !!destinationAddress;
  const scheduleValid =
    !!scheduledAt &&
    scheduledAt.getTime() >= Date.now() + MIN_LEAD_MS &&
    scheduledAt.getTime() <= Date.now() + MAX_LEAD_MS;
  const canSubmit = hasPickup && hasDropoff && scheduleValid && !requesting;

  let validationHint: string | null = null;
  if (!hasPickup) validationHint = "Set your pickup location to schedule a ride.";
  else if (!hasDropoff) validationHint = "Enter a destination to schedule a ride.";
  else if (!scheduledAt || scheduledAt.getTime() < Date.now() + MIN_LEAD_MS)
    validationHint = "Pickup time must be at least 30 minutes from now.";
  else if (scheduledAt.getTime() > Date.now() + MAX_LEAD_MS)
    validationHint = "Rides can be scheduled up to 7 days ahead.";

  const handleSelectDate = (day: Date) => {
    setError(null);
    setScheduledAt((prev) => {
      const base = prev ?? new Date();
      const merged = new Date(day);
      merged.setHours(base.getHours(), base.getMinutes(), 0, 0);
      return merged;
    });
  };

  const handleSelectTime = (time: Date) => {
    setError(null);
    setScheduledAt((prev) => {
      const base = prev ?? new Date();
      const merged = new Date(base);
      merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
      return merged;
    });
  };

  const handleSchedule = async () => {
    if (!scheduledAt || !canSubmit) return;
    setRequesting(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated. Please sign in again.");
        setRequesting(false);
        return;
      }
      const res = await fetch(`${API_URL}/api/ride/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_lat: userLatitude,
          pickup_lng: userLongitude,
          pickup_address: userAddress,
          dropoff_lat: destinationLatitude,
          dropoff_lng: destinationLongitude,
          dropoff_address: destinationAddress,
          vehicle_type: vehicleType,
          scheduled_at: scheduledAt.toISOString(),
        }),
      });
      const data = await res.json();
      if (data?.ride_id) {
        router.replace({
          pathname: "/(main)/(customer)/ride-scheduled",
          params: {
            ride_id: data.ride_id,
            scheduled_at: scheduledAt.toISOString(),
          },
        });
        return;
      }
      setError(
        data?.message ?? "Could not schedule the ride. Please try again.",
      );
    } catch (e) {
      logger.error("[schedule-ride] schedule failed", e);
      setError("Network error. Please try again.");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          Schedule a Ride
        </Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Pickup + destination */}
        <Text style={[styles.sectionTitle, { color: textPrimary }]}>Pickup</Text>
        <BarikoiAutocomplete
          icon={icons.target}
          initialLocation={userAddress ?? "Current Location"}
          handlePress={(location) => setUserLocation(location)}
        />

        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          Destination
        </Text>
        <BarikoiAutocomplete
          icon={icons.pin}
          initialLocation={destinationAddress ?? "Enter Destination"}
          handlePress={(location) => setDestinationLocation(location)}
        />

        {/* Vehicle */}
        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          Vehicle
        </Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map((vt) => {
            const isActive = vt.key === vehicleType;
            return (
              <TouchableOpacity
                key={vt.key}
                onPress={() => {
                  setVehicleType(vt.key);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Select ${vt.display_en}`}
                style={[
                  styles.vehicleChip,
                  {
                    borderColor: isActive ? colors.primary : borderColor,
                    backgroundColor: isActive ? colors.primary : surfaceBg,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.vehicleChipText,
                    { color: isActive ? colors.white : textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {vt.display_en}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Date + time */}
        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          Date & Time
        </Text>
        <View style={{ marginBottom: spacing.md }}>
          <DatePicker selectedDate={scheduledAt} onSelectDate={handleSelectDate} />
        </View>
        <TimePicker
          date={scheduledAt}
          selectedTime={scheduledAt}
          onSelectTime={handleSelectTime}
        />

        {scheduledAt && scheduleValid && (
          <View style={[styles.schedulePreview, { backgroundColor: surfaceBg, borderColor }]}>
            <Ionicons name="time-outline" size={16} color={colors.primary} />
            <Text style={[styles.schedulePreviewText, { color: textSecondary }]}>
              Pickup at{" "}
              <Text style={{ color: textPrimary, fontFamily: "Jakarta-SemiBold" }}>
                {scheduledAt.toLocaleString("en-GB", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: `${colors.danger}14` }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        {validationHint && !error && (
          <Text style={[styles.hint, { color: textSecondary }]}>{validationHint}</Text>
        )}

        <TouchableOpacity
          style={[
            styles.submitBtn,
            { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 },
          ]}
          onPress={handleSchedule}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="Schedule ride"
        >
          {requesting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>Schedule Ride</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    marginBottom: 8,
  },
  sectionGap: {
    marginTop: 20,
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  vehicleChip: {
    flexBasis: "30%",
    flexGrow: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: "center",
  },
  vehicleChipText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  schedulePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  schedulePreviewText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    flex: 1,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    flex: 1,
  },
  hint: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 16,
  },
  submitBtn: {
    height: 56,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  submitBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    color: colors.white,
  },
});
