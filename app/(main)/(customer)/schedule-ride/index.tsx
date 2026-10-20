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
import Ionicons from "@expo/vector-icons/Ionicons";
import { API_URL } from "@/lib/config";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useCustomer } from "@/store";
import { useRiderStore } from "@/store/useRiderStore";
import { VEHICLE_TYPES, VehicleTypeEnum, BIKE_FAMILY } from "@/lib/vehicleTypes";
import { RIDE_GATE_ERROR_COPY } from "@/lib/rideGateErrorCopy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";
import ScheduleRideSheet from "@/components/ScheduleRideSheet";
import { icons } from "@/constants/data";
import { useTranslation } from "react-i18next";

const MIN_LEAD_MS = 30 * 60 * 1000;
const MAX_LEAD_MS = 7 * 24 * 60 * 60 * 1000;

// §4.8 consolidation: vehicle label keys are built inline at the t() call
// site (see the vehicle grid below). A filled-then-indexed const table is
// invisible to the i18n orphan auditor — `t(`ns.prefix.${x}`)` is the
// template-prefix evidence tier that keeps the registry-driven keys
// provably reachable. vehicle_scooter joins automatically; its key lands §4.9.

export default function ScheduleRide() {
  const { t } = useTranslation();
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
  // S8 §4.3: women-only toggle (same R-4 visibility rule as booking sheet).
  const [userGender, setUserGender] = useState<string | null>(null);
  const [womenOnlyEnabled, setWomenOnlyEnabled] = useState(false);
  const [womenOnly, setWomenOnly] = useState(false);
  const [secondaryFemale, setSecondaryFemale] = useState(false);

  // Identity + kill switch + sticky preference (shared key with home sheet).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.WOMEN_ONLY_PREFERENCE);
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token || !active) return;
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        if (!active) return;
        setUserGender(data?.user?.gender ?? null);
        setWomenOnlyEnabled(data?.women_only_rides_enabled === true);
        if (stored === "true") setWomenOnly(true);
      } catch (e) {
        logger.error("[schedule-ride] women-only init failed", e);
      }
    })();
    return () => { active = false; };
  }, []);

  // S8 §4.3 R-4: female rider + bike-family type + kill switch on.
  const showWomenOnlyToggle =
    userGender === "female" &&
    BIKE_FAMILY.includes(vehicleType) &&
    womenOnlyEnabled;

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
  if (!hasPickup) validationHint = t('schedule_ride.set_pickup');
  else if (!hasDropoff) validationHint = t('schedule_ride.enter_destination');
  else if (!scheduledAt || scheduledAt.getTime() < Date.now() + MIN_LEAD_MS)
    validationHint = t('schedule_ride.min_lead');
  else if (scheduledAt.getTime() > Date.now() + MAX_LEAD_MS)
    validationHint = t('schedule_ride.max_lead');

  const handleSelectTime = (iso: string) => {
    setError(null);
    setScheduledAt(new Date(iso));
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
        setError(t('schedule_ride.not_authenticated'));
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
          // S8 §4.3: women-only markers (server gates each code).
          women_only: showWomenOnlyToggle && womenOnly,
          secondary_rider_female: secondaryFemale,
        }),
      });
      const data = await res.json();
      if (data?.ride_id) {
        router.replace({
          pathname: "/(main)/(customer)/ride-scheduled",
          params: {
            ride_id: data.ride_id,
            scheduled_at: scheduledAt.toISOString(),
            // Plan-05 W1: pass the quote through for the confirmation screen
            ...(data.ride_scheduled_quote
              ? { quote_total_taka: String(data.ride_scheduled_quote.total_bdt / 100) }
              : {}),
          },
        });
        return;
      }
      // S8 §4.9: known booking-gate codes show localized copy; anything
      // else keeps the server's honest message.
      const gateCopy = data?.error ? RIDE_GATE_ERROR_COPY[data.error] : undefined;
      setError(
        gateCopy ? t(gateCopy) : (data?.message ?? t('schedule_ride.could_not_schedule')),
      );
    } catch (e) {
      logger.error("[schedule-ride] schedule failed", e);
      setError(t('schedule_ride.network_error'));
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
          accessibilityLabel={t('schedule_ride.go_back')}
         testID="customer.schedule-ride.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          {t('schedule_ride.title')}
        </Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('schedule_ride.toggle_theme')}
         testID="customer.schedule-ride.set-theme">
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
        <Text style={[styles.sectionTitle, { color: textPrimary }]}>{t('schedule_ride.pickup')}</Text>
        <BarikoiAutocomplete
          icon={icons.target}
          initialLocation={userAddress ?? t('schedule_ride.current_location')}
          handlePress={(location) => setUserLocation(location)}
        />

        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          {t('schedule_ride.destination')}
        </Text>
        <BarikoiAutocomplete
          icon={icons.pin}
          initialLocation={destinationAddress ?? t('schedule_ride.enter_destination_placeholder')}
          handlePress={(location) => setDestinationLocation(location)}
        />

        {/* Vehicle */}
        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          {t('schedule_ride.vehicle')}
        </Text>
        <View style={styles.vehicleGrid}>
          {VEHICLE_TYPES.map((vt) => {
            const isActive = vt.key === vehicleType;
            const label = t(`schedule_ride.vehicle_${vt.key}`, { defaultValue: vt.display_en });
            return (
              <TouchableOpacity
                key={vt.key}
                onPress={() => {
                  setVehicleType(vt.key);
                  setError(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('schedule_ride.select_vehicle', { name: label })}
                style={[
                  styles.vehicleChip,
                  {
                    borderColor: isActive ? colors.primary : borderColor,
                    backgroundColor: isActive ? colors.primary : surfaceBg,
                  },
                ]}
               testID="customer.schedule-ride.set-vehicle-type">
                <Text
                  style={[
                    styles.vehicleChipText,
                    { color: isActive ? colors.white : textSecondary },
                  ]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* S8 §4.3: women-only toggle (female + bike + kill switch). */}
        {showWomenOnlyToggle && (
          <View style={{ marginTop: 20, gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                const next = !womenOnly;
                setWomenOnly(next);
                AsyncStorage.setItem(
                  STORAGE_KEYS.WOMEN_ONLY_PREFERENCE,
                  next ? "true" : "false",
                ).catch(() => {});
              }}
              accessibilityRole="switch"
              style={[
                styles.vehicleChip,
                {
                  borderColor: womenOnly ? colors.primary : borderColor,
                  backgroundColor: womenOnly ? colors.primary : surfaceBg,
                },
              ]}
             testID="customer.schedule-ride.set-women-only">
              <Text
                style={[
                  styles.vehicleChipText,
                  { color: womenOnly ? colors.white : textPrimary },
                ]}
              >
                {t('women_only_toggle_title')}
              </Text>
            </TouchableOpacity>
            {womenOnly && (
              <Text style={[styles.hint, { color: textSecondary, marginTop: 0 }]}>
                {t('women_only_toggle_hint')}
              </Text>
            )}
            {womenOnly && (
              <TouchableOpacity
                onPress={() => setSecondaryFemale((v) => !v)}
                accessibilityRole="checkbox"
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
               testID="customer.schedule-ride.set-secondary-female">
                <Ionicons
                  name={secondaryFemale ? "checkbox" : "square-outline"}
                  size={22}
                  color={secondaryFemale ? colors.primary : textSecondary}
                />
                <Text style={[styles.hint, { color: textPrimary, marginTop: 0, flex: 1 }]}>
                  {t('secondary_rider_female_confirm')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Date + time via ScheduleRideSheet */}
        <Text style={[styles.sectionTitle, styles.sectionGap, { color: textPrimary }]}>
          {t('schedule_ride.date_time')}
        </Text>
        <ScheduleRideSheet
          onConfirm={handleSelectTime}
          onClose={() => router.back()}
          initialDate={scheduledAt}
          estimateContext={
            hasPickup && hasDropoff
              ? {
                  pickup_lat: userLatitude!,
                  pickup_lng: userLongitude!,
                  dropoff_lat: destinationLatitude!,
                  dropoff_lng: destinationLongitude!,
                  vehicle_type: vehicleType,
                }
              : undefined
          }
        />

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
          accessibilityLabel={t('schedule_ride.a11y_schedule')}
         testID="customer.schedule-ride.handle-schedule">
          {requesting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitBtnText}>{t('schedule_ride.schedule_ride')}</Text>
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
