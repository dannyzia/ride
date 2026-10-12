/**
 * Rental request creation screen — form for car/truck/ambulance-scheduled.
 * Creates a rental request via POST /api/rental/requests.
 *
 * Phase 5 (truck): the "Truck" entry affordance at top enters truck mode with
 * category locked (briefing V5); truck mode lists trucks the Bangladeshi way
 * (ft × ton × open/covered, use-case tabs) and keeps cargo fields prominent.
 * Scheduling (NOW/SCHEDULED + duration) and condition/option chips are the
 * round-5 additions (rulings 13–14). POST shape = Phase 2 + new optional
 * fields; endpoint unchanged.
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useRentalStore } from "@/store/useRentalStore";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { toUtcIso } from "@/lib/time";
import DatePicker from "@/components/DatePicker";
import TimePicker from "@/components/TimePicker";
import TruckPicker from "./_components/TruckPicker";
import {
  CARGO_TYPE_CHIPS,
  DURATION_HOUR_OPTIONS,
  RENTAL_OPTION_CHIPS,
  findTruckVariant,
  type TruckVariant,
} from "@/constants/truckCatalog";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const CATEGORIES = [
  { key: "car_rental", labelKey: "rental_marketplace.cat_car", icon: "car-sport", color: colors.primary },
  { key: "truck_rental", labelKey: "rental_marketplace.cat_truck", icon: "bus", color: colors.blue },
  { key: "ambulance_scheduled", labelKey: "rental_marketplace.cat_amb", icon: "medkit", color: colors.danger },
] as const;

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  textColor: string;
  chipBg: string;
  borderColor: string;
  selectedColor: string;
}

function Chip({ label, selected, onPress, textColor, chipBg, borderColor, selectedColor }: ChipProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        backgroundColor: selected ? selectedColor + "1A" : chipBg,
        borderWidth: 1,
        borderColor: selected ? selectedColor : borderColor,
        borderRadius: 10,
        paddingHorizontal: 10,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
      }}
     testID="customer.rental-marketplace.on-press">
      <Text
        style={{
          fontSize: 12,
          fontFamily: selected ? "JakartaSemiBold" : "JakartaMedium",
          color: selected ? selectedColor : textColor,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function RentalIndexScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const params = useLocalSearchParams<{ category?: string }>();
  const paramCategory =
    typeof params.category === "string" &&
    ["car_rental", "truck_rental", "ambulance_scheduled"].includes(params.category)
      ? params.category
      : null;

  const { setActiveRequest, setBids } = useRentalStore();
  const [category, setCategory] = useState<string>(paramCategory ?? "car_rental");
  const [pickupAddress, setPickupAddress] = useState("");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [trackingRequired, setTrackingRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Truck mode state
  const [selectedTruckKey, setSelectedTruckKey] = useState<string | null>(null);
  const [cargoTypeTags, setCargoTypeTags] = useState<string[]>([]);
  const [rentalOptions, setRentalOptions] = useState<string[]>([]);
  const [cargoWeight, setCargoWeight] = useState("");
  const [cargoVolume, setCargoVolume] = useState("");
  const [cargoDescription, setCargoDescription] = useState("");

  // Car class state (ruling 16)
  const [selectedCarClass, setSelectedCarClass] = useState<string | null>(null);

  // Ambulance-scheduled state (Phase 6)
  const [serviceLevel, setServiceLevel] = useState<"BLS" | "ALS">("BLS");
  const [requiresParamedic, setRequiresParamedic] = useState(false);
  const [patientCondition, setPatientCondition] = useState("");

  // Scheduling state (ruling 14)
  const [startMode, setStartMode] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [durationHours, setDurationHours] = useState<number | null>(null);

  // Car rental options (ruling 13 — stored as comma-separated rental_options)
  const [carRentalOptions, setCarRentalOptions] = useState<string[]>([]);

  const toggleCarOption = (opt: string) =>
    setCarRentalOptions((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));

  const isTruck = category === "truck_rental";
  const isCar = category === "car_rental";
  const isAmbulance = category === "ambulance_scheduled";
  const selectedVariant: TruckVariant | null = findTruckVariant(selectedTruckKey);

  const scheduledDateTime = useMemo<Date | null>(() => {
    if (!scheduledDate || !scheduledTime) return null;
    const d = new Date(scheduledDate);
    d.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
    return d;
  }, [scheduledDate, scheduledTime]);
  const scheduledInPast =
    startMode === "scheduled" && scheduledDateTime != null && scheduledDateTime.getTime() <= Date.now();

  const hasAnyCargoDetail =
    cargoTypeTags.length > 0 ||
    rentalOptions.length > 0 ||
    cargoWeight.trim().length > 0 ||
    cargoVolume.trim().length > 0 ||
    cargoDescription.trim().length > 0;

  const toggleCargoTag = (tag: string) =>
    setCargoTypeTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  const toggleRentalOption = (opt: string) =>
    setRentalOptions((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));

  // V5: ALL truck mode is locked — the 3-card selector is hidden once truck
  // mode is active; back navigation is the exit.
  const enterTruckMode = () => setCategory("truck_rental");

  const handleSubmit = async () => {
    if (!pickupAddress || !dropoffAddress) {
      Alert.alert(t("rental_marketplace.err_missing_title"), t("rental_marketplace.err_missing_addresses"));
      return;
    }
    if (isTruck && startMode === "scheduled" && (!scheduledDateTime || scheduledInPast)) {
      Alert.alert(t("rental_marketplace.schedule_title"), t("rental_marketplace.err_schedule_past"));
      return;
    }
    if (isAmbulance && !patientCondition.trim()) {
      Alert.alert(t("rental_marketplace.err_missing_title"), t("rental_marketplace.err_patient_required"));
      return;
    }

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      // Phase 2 shape; truck mode adds cargo/options/scheduling/requested_vehicle_type;
      // ambulance-scheduled adds urgency='alarm' + service_level/patient fields (Phase 6).
      const body: Record<string, unknown> = {
        category,
        ...(isAmbulance ? { urgency: "alarm" } : {}),
        pickup_address: pickupAddress,
        pickup_lat: 23.8103, // TODO: use actual GPS
        pickup_lng: 90.4125,
        dropoff_address: dropoffAddress,
        dropoff_lat: 23.8200,
        dropoff_lng: 90.4200,
        tracking_required: trackingRequired,
      };        if (isTruck) {
          const tags = [...cargoTypeTags];
          if (selectedVariant?.bodyStyle) tags.push(selectedVariant.bodyStyle);
          body.requested_vehicle_type = selectedVariant?.vehicleType;
          if (tags.length > 0) body.cargo_tags = tags;
          const weight = parseInt(cargoWeight, 10);
          if (Number.isFinite(weight) && weight > 0) body.cargo_weight_kg = weight;
          const volume = parseFloat(cargoVolume);
          if (Number.isFinite(volume) && volume > 0) body.cargo_volume_m3 = volume;
          if (cargoDescription.trim()) body.cargo_description = cargoDescription.trim();
          if (rentalOptions.length > 0) body.rental_options = rentalOptions.join(", ");
          if (startMode === "scheduled" && scheduledDateTime) {
            body.scheduled_start_at = toUtcIso(scheduledDateTime);
          }
          if (durationHours != null) body.duration_hours = durationHours;
        }

        if (category === "car_rental") {
          // Ruling 16: car class as requested_vehicle_type
          if (selectedCarClass) body.requested_vehicle_type = selectedCarClass;
          // Ruling 13: options as comma-separated string
          if (carRentalOptions.length > 0) body.rental_options = carRentalOptions.join(", ");
          // Ruling 14: scheduling
          if (startMode === "scheduled" && scheduledDateTime) {
            body.scheduled_start_at = toUtcIso(scheduledDateTime);
          }
          if (durationHours != null) body.duration_hours = durationHours;
        }

      if (isAmbulance) {
        // F2: service_level REQUIRED for ambulance_scheduled (server cross-field)
        body.service_level = serviceLevel;
        body.requires_paramedic = requiresParamedic;
        body.patient_condition = patientCondition.trim();
        if (startMode === "scheduled" && scheduledDateTime) {
          body.scheduled_start_at = toUtcIso(scheduledDateTime);
        }
        if (durationHours != null) body.duration_hours = durationHours;
      }

      const res = await fetch(`${SERVER_URL}/api/rental/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("common.error"), data.message || t("rental_marketplace.err_create"));
        return;
      }

      setActiveRequest({
        id: data.request_id,
        category,
        urgency: "standard",
        status: "broadcasting",
        pickup_address: pickupAddress,
        pickup_lat: 23.8103,
        pickup_lng: 90.4125,
        dropoff_address: dropoffAddress,
        dropoff_lat: 23.8200,
        dropoff_lng: 90.4200,
        requested_vehicle_type: selectedVariant?.vehicleType ?? null,
        bidding_window_seconds: 1200,
        soft_deadline_at: data.soft_deadline_at,
        awarded_bid_id: null,
        awarded_at: null,
        confirmation_deadline_at: null,
        tracking_required: trackingRequired,
        created_at: new Date().toISOString(),
      });
      setBids([]);

      router.push("/(main)/(customer)/(rental-marketplace)/bidding");
    } catch (err) {
      logger.error("[rental/create] error", err);
      Alert.alert(t("common.error"), t("rental_marketplace.err_create"));
    } finally {
      setSubmitting(false);
    }
  };

  const renderCargoSection = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 4 }}>
        {t("rental_marketplace.cargo_details")}
      </Text>
      {!hasAnyCargoDetail && (
        <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: colors.amber, marginBottom: 8 }}>
          {t("rental_marketplace.cargo_hint")}
        </Text>
      )}

      {/* Conditions & options → rental_options CSV (ruling 13) */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>
        {t("rental_marketplace.conditions_options")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {RENTAL_OPTION_CHIPS.map((opt) => (
          <Chip
            key={opt}
            label={opt}
            selected={rentalOptions.includes(opt)}
            onPress={() => toggleRentalOption(opt)}
            textColor={textPrimary}
            chipBg={surfaceBg}
            borderColor={borderColor}
            selectedColor={colors.amber}
          />
        ))}
      </View>

      {/* Cargo type → cargo_tags */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 4, marginBottom: 6 }}>
        {t("rental_marketplace.cargo_type")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {CARGO_TYPE_CHIPS.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            selected={cargoTypeTags.includes(tag)}
            onPress={() => toggleCargoTag(tag)}
            textColor={textPrimary}
            chipBg={surfaceBg}
            borderColor={borderColor}
            selectedColor={colors.primary}
          />
        ))}
      </View>

      {/* Weight / volume */}
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>
            {t("rental_marketplace.weight_kg")}
          </Text>
          <TextInput
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 14,
              color: textPrimary,
              fontSize: 15,
            }}
            placeholder={t("rental_marketplace.weight_placeholder")}
            placeholderTextColor={textSecondary}
            value={cargoWeight}
            onChangeText={setCargoWeight}
            keyboardType="number-pad"
            accessibilityLabel={t("rental_marketplace.a11y_weight")}
           testID="customer.rental-marketplace.set-cargo-weight"/>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>
            {t("rental_marketplace.volume_m3")}
          </Text>
          <TextInput
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 14,
              color: textPrimary,
              fontSize: 15,
            }}
            placeholder={t("rental_marketplace.volume_placeholder")}
            placeholderTextColor={textSecondary}
            value={cargoVolume}
            onChangeText={setCargoVolume}
            keyboardType="decimal-pad"
            accessibilityLabel={t("rental_marketplace.a11y_volume")}
           testID="customer.rental-marketplace.set-cargo-volume"/>
        </View>
      </View>

      {/* Description */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12, marginBottom: 6 }}>
        {t("rental_marketplace.description")}
      </Text>
      <TextInput
        style={{
          backgroundColor: surfaceBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          padding: 14,
          color: textPrimary,
          fontSize: 15,
          minHeight: 80,
          textAlignVertical: "top",
        }}
        placeholder={t("rental_marketplace.description_placeholder")}
        placeholderTextColor={textSecondary}
        value={cargoDescription}
        onChangeText={setCargoDescription}
        multiline
        accessibilityLabel={t("rental_marketplace.description")}
       testID="customer.rental-marketplace.set-cargo-description"/>
    </View>
  );

  const renderAmbulanceSection = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
        {t("rental_marketplace.ambulance_details")}
      </Text>

      {/* Service level — REQUIRED (F2) */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>
        {t("rental_marketplace.service_level_required")}
      </Text>
      <View style={{ flexDirection: "row", marginBottom: 14 }}>
        {(["BLS", "ALS"] as const).map((lvl) => (
          <TouchableOpacity
            key={lvl}
            onPress={() => setServiceLevel(lvl)}
            accessibilityRole="button"
            accessibilityLabel={`Service level ${lvl}`}
            accessibilityState={{ selected: serviceLevel === lvl }}
            style={{
              flex: 1,
              paddingVertical: 12,
              alignItems: "center",
              backgroundColor: serviceLevel === lvl ? colors.danger + "18" : surfaceBg,
              borderWidth: 2,
              borderColor: serviceLevel === lvl ? colors.danger : borderColor,
              borderRadius: 12,
              marginRight: lvl === "BLS" ? 8 : 0,
            }}
           testID="customer.rental-marketplace.set-service-level">
            <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: serviceLevel === lvl ? colors.danger : textSecondary }}>
              {lvl}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Paramedic toggle */}
      <TouchableOpacity
        onPress={() => setRequiresParamedic(!requiresParamedic)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 14,
          backgroundColor: surfaceBg,
          borderWidth: 1,
          borderColor: requiresParamedic ? colors.danger : borderColor,
          borderRadius: 12,
          marginBottom: 14,
        }}
        accessibilityRole="button"
        accessibilityLabel={t("ambulance.a11y_paramedic")}
        accessibilityState={{ selected: requiresParamedic }}
       testID="customer.rental-marketplace.set-requires-paramedic">
        <Ionicons
          name={requiresParamedic ? "checkmark-circle" : "ellipse-outline"}
          size={24}
          color={requiresParamedic ? colors.danger : textSecondary}
        />
        <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 12 }}>
          {t("ambulance.paramedic_required")}
        </Text>
      </TouchableOpacity>

      {/* Patient condition — stored, winner-only reveal; NEVER broadcast (F41) */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 6 }}>
        {t("ambulance.patient_condition")}
      </Text>
      <TextInput
        style={{
          backgroundColor: surfaceBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          padding: 14,
          color: textPrimary,
          fontSize: 15,
          minHeight: 80,
          textAlignVertical: "top",
        }}
        placeholder={t("ambulance.patient_condition_placeholder")}
        placeholderTextColor={textSecondary}
        value={patientCondition}
        onChangeText={setPatientCondition}
        multiline
        accessibilityLabel={t("ambulance.patient_condition")}
       testID="customer.rental-marketplace.set-patient-condition"/>
    </View>
  );

  const renderScheduleSection = () => (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
        {t("rental_marketplace.when_needed")}
      </Text>
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        {(["now", "scheduled"] as const).map((mode) => {
          const active = startMode === mode;
          return (
            <TouchableOpacity
              key={mode}
              onPress={() => setStartMode(mode)}
              accessibilityRole="button"
              accessibilityLabel={mode === "now" ? t("rental_marketplace.a11y_start_now") : t("rental_marketplace.a11y_schedule_later")}
              accessibilityState={{ selected: active }}
              style={{
                flex: 1,
                paddingVertical: 12,
                alignItems: "center",
                backgroundColor: active ? colors.primary + "18" : surfaceBg,
                borderWidth: 2,
                borderColor: active ? colors.primary : borderColor,
                borderRadius: 12,
                marginRight: mode === "now" ? 8 : 0,
              }}
             testID="customer.rental-marketplace.set-start-mode">
              <Text
                style={{
                  fontSize: 14,
                  fontFamily: active ? "JakartaSemiBold" : "JakartaMedium",
                  color: active ? colors.primary : textSecondary,
                }}
              >
                {mode === "now" ? t("rental_marketplace.start_now") : t("rental_marketplace.scheduled")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {startMode === "scheduled" && (
        <View>
          <DatePicker
            selectedDate={scheduledDate}
            onSelectDate={setScheduledDate}
            dayCount={14}
          />
          <TimePicker
            date={scheduledDate}
            selectedTime={scheduledTime}
            onSelectTime={setScheduledTime}
          />
          {scheduledDateTime && !scheduledInPast && (
            <Text
              style={{ fontSize: 12, fontFamily: "JakartaMedium", color: colors.primary, marginTop: 6 }}
              accessibilityLabel={t("rental_marketplace.a11y_selected_start")}
            >
              {t("rental_marketplace.starts_at", {
                time: scheduledDateTime.toLocaleString("en-GB", { timeZone: "Asia/Dhaka" }),
              })}
            </Text>
          )}
          {scheduledInPast && (
            <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: colors.danger, marginTop: 6 }}>
              {t("rental_marketplace.pick_future_time")}
            </Text>
          )}
        </View>
      )}

      {/* Duration hours (ruling 14) */}
      <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 12, marginBottom: 6 }}>
        {t("rental_marketplace.duration_hours")}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {DURATION_HOUR_OPTIONS.map((h) => (
          <Chip
            key={h}
            label={`${h}h`}
            selected={durationHours === h}
            onPress={() => setDurationHours(durationHours === h ? null : h)}
            textColor={textPrimary}
            chipBg={surfaceBg}
            borderColor={borderColor}
            selectedColor={colors.primary}
          />
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.rental-marketplace.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {isTruck ? t("rental_marketplace.title_truck") : isAmbulance ? t("rental_marketplace.title_ambulance") : t("rental_marketplace.title")}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }}>
        {isTruck ? (
          <>
            {/* Locked category bar (V5) */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 14,
                backgroundColor: colors.blue + "14",
                borderWidth: 1,
                borderColor: colors.blue,
                borderRadius: 12,
                marginBottom: 16,
              }}
              accessibilityLabel={t("rental_marketplace.a11y_truck_locked")}
            >
              <Ionicons name="bus" size={22} color={colors.blue} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                  {t("rental_marketplace.truck_rental_bilingual")}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                  {t("rental_marketplace.category_locked")}
                </Text>
              </View>
              <Ionicons name="lock-closed" size={18} color={colors.blue} />
            </View>

            {/* Truck picker (Bangladesh tradition) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 4 }}>
              {t("rental_marketplace.select_truck")}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginBottom: 8 }}>
              {t("rental_marketplace.select_truck_hint")}
            </Text>
            <TruckPicker
              selectedKey={selectedTruckKey}
              onSelect={(variant) => setSelectedTruckKey(variant.key)}
            />

            {/* Cargo fields — prominent (Phase 5) */}
            <View style={{ height: 20 }} />
            {renderCargoSection()}

            {/* Scheduling (ruling 14) */}
            {renderScheduleSection()}
          </>
        ) : (
          <>
            {/* Truck entry affordance (routes into locked truck mode) */}
            <TouchableOpacity
              onPress={enterTruckMode}
              accessibilityRole="button"
              accessibilityLabel={t("rental_marketplace.a11y_truck_entry")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 16,
                backgroundColor: colors.blue + "14",
                borderWidth: 2,
                borderColor: colors.blue,
                borderRadius: 14,
                marginBottom: 20,
              }}
             testID="customer.rental-marketplace.enter-truck-mode">
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.blue + "1F",
                  marginRight: 12,
                }}
              >
                <Ionicons name="cube" size={24} color={colors.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: colors.blue }}>
                  {t("rental_marketplace.truck_rental_bilingual")}
                </Text>
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                  {t("rental_marketplace.truck_entry_body")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.blue} />
            </TouchableOpacity>

            {/* Category selector */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("rental_marketplace.what_needed")}
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 20 }}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  onPress={() => setCategory(cat.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 16,
                    alignItems: "center",
                    backgroundColor: category === cat.key ? cat.color + "18" : surfaceBg,
                    borderWidth: 2,
                    borderColor: category === cat.key ? cat.color : borderColor,
                    borderRadius: 12,
                    marginRight: cat.key !== "ambulance_scheduled" ? 8 : 0,
                  }}
                 testID="customer.rental-marketplace.set-category">
                  <Ionicons
                    name={cat.icon as "car-sport" | "bus" | "medkit"}
                    size={28}
                    color={category === cat.key ? cat.color : textSecondary}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontFamily: "JakartaMedium",
                      color: category === cat.key ? cat.color : textSecondary,
                      marginTop: 4,
                      textAlign: "center",
                    }}
                  >
                    {cat.key === "car_rental"
                      ? t("rental_marketplace.cat_car")
                      : cat.key === "truck_rental"
                        ? t("rental_marketplace.cat_truck")
                        : t("rental_marketplace.cat_amb")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Car class selector (ruling 16) */}
            {category === "car_rental" && (
              <>
                <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
                  {t("rental_marketplace.select_car_class")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
                  {                  (
                    [
                      { key: "car_compact", labelKey: "rental_marketplace.class_compact" },
                      { key: "car_economy", labelKey: "rental_marketplace.class_economy" },
                      { key: "car_comfort", labelKey: "rental_marketplace.class_comfort" },
                      { key: "car_premium", labelKey: "rental_marketplace.class_premium" },
                      { key: "car_xl", labelKey: "rental_marketplace.class_xl" },
                    ] as const
                  ).map((cls) => {
                    const isSelected = selectedCarClass === cls.key;
                    return (
                      <TouchableOpacity
                        key={cls.key}
                        onPress={() => setSelectedCarClass(cls.key)}
                        style={{
                          backgroundColor: isSelected ? colors.primary + "1A" : surfaceBg,
                          borderWidth: 2,
                          borderColor: isSelected ? colors.primary : borderColor,
                          borderRadius: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={cls.key === "car_compact" ? t("rental_marketplace.class_compact") : cls.key === "car_economy" ? t("rental_marketplace.class_economy") : cls.key === "car_comfort" ? t("rental_marketplace.class_comfort") : cls.key === "car_premium" ? t("rental_marketplace.class_premium") : t("rental_marketplace.class_xl")}
                        accessibilityState={{ selected: isSelected }}
                       testID="customer.rental-marketplace.set-selected-car-class">
                        <Text style={{ fontSize: 13, fontFamily: isSelected ? "JakartaSemiBold" : "JakartaMedium", color: isSelected ? colors.primary : textSecondary }}>
                          {cls.key === "car_compact" ? t("rental_marketplace.class_compact") : cls.key === "car_economy" ? t("rental_marketplace.class_economy") : cls.key === "car_comfort" ? t("rental_marketplace.class_comfort") : cls.key === "car_premium" ? t("rental_marketplace.class_premium") : t("rental_marketplace.class_xl")}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Car options (ruling 13 — comma-separated rental_options) */}
                <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
                  {t("rental_marketplace.options_optional")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 16 }}>
                  {(
                    [
                      "Round trip",
                      "Toll included",
                      "Decoration",
                      "Night stay",
                    ] as const
                  ).map((opt) => (
                    <Chip
                      key={opt}
                      label={opt === "Round trip" ? t("rental_marketplace.opt_round_trip") : opt === "Toll included" ? t("rental_marketplace.opt_toll") : opt === "Decoration" ? t("rental_marketplace.opt_decoration") : t("rental_marketplace.opt_night_stay")}
                      selected={carRentalOptions.includes(opt)}
                      onPress={() => toggleCarOption(opt)}
                      textColor={textPrimary}
                      chipBg={surfaceBg}
                      borderColor={borderColor}
                      selectedColor={colors.amber}
                    />
                  ))}
                </View>
              </>
            )}

            {/* Ambulance-scheduled fields (Phase 6) */}
            {isAmbulance && renderAmbulanceSection()}

            {/* Scheduling (ruling 14) — shared by truck, car, and ambulance modes */}
            {(isTruck || isAmbulance || category === "car_rental") && renderScheduleSection()}
          </>
        )}

        {/* Pickup */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          {t("ambulance.pickup_location")}
        </Text>
        <TextInput
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            color: textPrimary,
            fontSize: 15,
            marginBottom: 16,
          }}
          placeholder={t("ambulance.pickup_placeholder")}
          placeholderTextColor={textSecondary}
          value={pickupAddress}
          onChangeText={setPickupAddress}
         testID="customer.rental-marketplace.set-pickup-address"/>

        {/* Dropoff */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          {t("rental_marketplace.dropoff_location")}
        </Text>
        <TextInput
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            color: textPrimary,
            fontSize: 15,
            marginBottom: 16,
          }}
          placeholder={t("rental_marketplace.dropoff_placeholder")}
          placeholderTextColor={textSecondary}
          value={dropoffAddress}
          onChangeText={setDropoffAddress}
         testID="customer.rental-marketplace.set-dropoff-address"/>

        {/* Tracking toggle */}
        <TouchableOpacity
          onPress={() => setTrackingRequired(!trackingRequired)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 14,
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor: trackingRequired ? colors.primary : borderColor,
            borderRadius: 12,
            marginBottom: 24,
          }}
         testID="customer.rental-marketplace.set-tracking-required">
          <Ionicons
            name={trackingRequired ? "checkmark-circle" : "ellipse-outline"}
            size={24}
            color={trackingRequired ? colors.primary : textSecondary}
          />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textPrimary }}>
              {t("rental_marketplace.tracking_required")}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
              {t("rental_marketplace.tracking_hint")}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || !pickupAddress || !dropoffAddress}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 12,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            opacity: submitting || !pickupAddress || !dropoffAddress ? 0.5 : 1,
            marginBottom: 40,
          }}
         testID="customer.rental-marketplace.handle-submit">
          {submitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
              {isTruck
                ? t("rental_marketplace.cta_truck")
                : isCar
                  ? t("rental_marketplace.cta_car")
                  : isAmbulance
                    ? t("rental_marketplace.cta_ambulance")
                    : t("rental_marketplace.cta")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
