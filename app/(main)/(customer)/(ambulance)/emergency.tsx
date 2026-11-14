/**
 * Customer emergency ambulance screen (Phase 6) — create an emergency
 * request (POST /api/emergency/requests), then poll its status until
 * assigned/en-route/completed. Cancel allowed until terminal (§B.5).
 * patient_condition is stored but never broadcast (F41).
 *
 * ISSUE-118: pickup (+ optional dropoff) are POI/map location pickers reusing
 * the ride home's machinery (components/Map + components/BarikoiAutocomplete
 * + Barikoi v2 reverse geocode) — no new map system. The Stage-3 ensure
 * helper STAYS the default: on mount the pickup pre-fills from the ensured
 * GPS fix (+ reverse geocoded address); the picker is the explicit-adjust
 * path. Fetches use API_URL from @/lib/config (ISSUE-119 failure class).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { useEmergencyStore } from "@/store/useEmergencyStore";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { ensureCustomerLocation } from "@/lib/ensureLocation";
import { API_URL } from "@/lib/config";
import { getBarikoiReverseGeocodeUrl } from "@/lib/useBarikoiMapStyle";
import Map from "@/components/Map";
import BarikoiAutocomplete from "@/components/BarikoiAutocomplete";

/** A picked location — the shape the emergency legs carry into the request. */
interface PickedPlace {
  address: string;
  lat: number;
  lng: number;
}

// Labels resolved at render time via ambulance.status_* — t() inside the map
// component body, not at module scope.
const STATUS_STEPS: { key: string; labelKey: string }[] = [
  { key: "broadcasting", labelKey: "ambulance.status_broadcasting" },
  { key: "assigned", labelKey: "ambulance.status_assigned" },
  { key: "en_route_pickup", labelKey: "ambulance.status_en_route_pickup" },
  { key: "arrived", labelKey: "ambulance.status_arrived" },
  { key: "en_route_dropoff", labelKey: "ambulance.status_en_route_dropoff" },
  { key: "completed", labelKey: "ambulance.status_completed" },
];

export default function EmergencyAmbulanceScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const { activeEmergency, setActiveEmergency } = useEmergencyStore();
  const [serviceLevel, setServiceLevel] = useState<"BLS" | "ALS">("BLS");
  const [requiresParamedic, setRequiresParamedic] = useState(false);
  const [patientCondition, setPatientCondition] = useState("");
  // §7: explicit health consent for patient condition notes (required
  // whenever notes are entered — never transmitted without it).
  const [healthConsent, setHealthConsent] = useState(false);
  // ISSUE-118: pickup/dropoff are picked places (POI/map), not free text.
  const [pickup, setPickup] = useState<PickedPlace | null>(null);
  const [dropoff, setDropoff] = useState<PickedPlace | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Location picker (same machinery as the ride home / parcel screens) ──
  const [pickerTarget, setPickerTarget] = useState<"pickup" | "dropoff" | null>(null);
  const [pickerPin, setPickerPin] = useState<{ lat: number; lng: number } | null>(null);
  const [pickerPinAddress, setPickerPinAddress] = useState("");
  const [pickerPinLoading, setPickerPinLoading] = useState(false);

  // Stage-3 ensure stays the DEFAULT: pre-fill the pickup from the ensured
  // GPS fix (+ reverse geocoded address) once on mount; the picker is the
  // explicit-adjust path (silent-fallback contract — denied permission just
  // leaves the row empty for an explicit pick).
  useEffect(() => {
    let active = true;
    ensureCustomerLocation().then((ensured) => {
      if (active && ensured) {
        setPickup((prev) =>
          prev ?? {
            address: ensured.address,
            lat: ensured.latitude,
            lng: ensured.longitude,
          },
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Poll the active emergency's status (REST canonical — F25)
  const emergencyId = activeEmergency?.id ?? null;
  useEffect(() => {
    stopPolling();
    if (!emergencyId) return;
    pollRef.current = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/emergency/requests/${emergencyId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.request) {
          setActiveEmergency(data.request);
          if (["completed", "cancelled", "failed"].includes(data.request.status)) {
            stopPolling();
          }
        }
      } catch (err) {
        logger.error("[emergency] poll error", err);
      }
    }, 3000);
    return stopPolling;
  }, [emergencyId, setActiveEmergency, stopPolling]);

  // Ride-home reverse geocode (Barikoi v2) — silent-failure contract.
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(getBarikoiReverseGeocodeUrl(lat, lng));
      if (!res.ok) return "";
      const data = await res.json();
      return data?.place?.address || data?.place?.name || "";
    } catch {
      return ""; // non-blocking
    }
  }, []);

  // Ensure-before-use on picker open too (Stage 3 #19/G6) — hydrates the
  // customer store so the map centers on the user's area.
  const openPicker = useCallback((target: "pickup" | "dropoff") => {
    setPickerTarget(target);
    setPickerPin(null);
    setPickerPinAddress("");
    ensureCustomerLocation();
  }, []);

  const closePicker = useCallback(() => {
    setPickerTarget(null);
    setPickerPin(null);
    setPickerPinAddress("");
  }, []);

  const commitPicked = useCallback(
    (place: PickedPlace) => {
      if (pickerTarget === "pickup") setPickup(place);
      else if (pickerTarget === "dropoff") setDropoff(place);
      closePicker();
    },
    [pickerTarget, closePicker],
  );

  // Named handlers — the testID codemod derives ids from handler identifier
  // references (slug of the function name), so keep the names canonical.
  const openPickupPicker = useCallback(() => openPicker("pickup"), [openPicker]);
  const openDropoffPicker = useCallback(() => openPicker("dropoff"), [openPicker]);
  const clearDropoff = useCallback(() => setDropoff(null), []);

  const handleSuggestionPicked = useCallback(
    (location: { latitude: number; longitude: number; address: string }) => {
      commitPicked({
        lat: location.latitude,
        lng: location.longitude,
        address: location.address,
      });
    },
    [commitPicked],
  );

  const handlePickerMapPress = useCallback(
    async (coords: { lat: number; lng: number }) => {
      setPickerPin(coords);
      setPickerPinLoading(true);
      setPickerPinAddress("");
      try {
        const address = await reverseGeocode(coords.lat, coords.lng);
        if (address) setPickerPinAddress(address);
      } finally {
        setPickerPinLoading(false);
      }
    },
    [reverseGeocode],
  );

  const confirmPicked = useCallback(() => {
    if (!pickerPin) return;
    commitPicked({
      lat: pickerPin.lat,
      lng: pickerPin.lng,
      address: pickerPinAddress || `${pickerPin.lat.toFixed(4)}, ${pickerPin.lng.toFixed(4)}`,
    });
  }, [pickerPin, pickerPinAddress, commitPicked]);

  const handleCreate = async () => {
    if (!pickup || !patientCondition) {
      Alert.alert(t("ambulance.err_missing_title"), t("ambulance.err_missing_body"));
      return;
    }
    // §7: patient notes are health data — block submission without consent.
    if (patientCondition.trim().length > 0 && !healthConsent) {
      Alert.alert(t("ambulance.health_consent_required_title"), t("ambulance.health_consent_required_body"));
      return;
    }
    setSubmitting(true);
    try {
      // Stage 3 (#19/G6): ensure-before-use kept as the fallback path — if
      // the mount pre-fill was denied/empty the user must pick explicitly
      // (the old hardcoded Dhaka fallback is gone: wrong coordinates on an
      // emergency request are worse than a required explicit pick).
      const ensured = pickup ? null : await ensureCustomerLocation();
      const pickupFinal: PickedPlace | null = pickup ??
        (ensured
          ? { address: ensured.address, lat: ensured.latitude, lng: ensured.longitude }
          : null);
      if (!pickupFinal) {
        Alert.alert(t("ambulance.err_missing_title"), t("ambulance.err_missing_body"));
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${API_URL}/api/emergency/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_address: pickupFinal.address,
          pickup_lat: pickupFinal.lat,
          pickup_lng: pickupFinal.lng,
          ...(dropoff
            ? {
                dropoff_address: dropoff.address,
                dropoff_lat: dropoff.lat,
                dropoff_lng: dropoff.lng,
              }
            : {}),
          patient_condition: patientCondition,
          requires_paramedic: requiresParamedic,
          service_level: serviceLevel,
          health_consent_granted: healthConsent,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("common.error"), data.message || t("ambulance.err_broadcast"));
        return;
      }

      setActiveEmergency(data.request);
    } catch (err) {
      logger.error("[emergency] create error", err);
      Alert.alert(t("common.error"), t("ambulance.err_broadcast"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeEmergency) return;
    setCancelling(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${API_URL}/api/emergency/requests/${activeEmergency.id}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reason: "cancelled_by_caller" }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setActiveEmergency(data.request);
        stopPolling();
      } else {
        const data = await res.json();
        Alert.alert(t("common.error"), data.message || t("ambulance.err_cancel"));
      }
    } catch (err) {
      logger.error("[emergency] cancel error", err);
    } finally {
      setCancelling(false);
    }
  };

  const statusIndex = activeEmergency
    ? STATUS_STEPS.findIndex((s) => s.key === activeEmergency.status)
    : -1;
  const isTerminal =
    activeEmergency != null &&
    ["completed", "cancelled", "failed"].includes(activeEmergency.status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel={t("common.back")} testID="customer.ambulance.emergency.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: colors.danger, marginLeft: 12 }}>
          {t("ambulance.title")}
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
        {activeEmergency ? (
          <>
            {/* Status panel */}
            <View style={{ backgroundColor: colors.danger + "12", borderWidth: 1, borderColor: colors.danger, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <View accessibilityLiveRegion="polite" accessibilityLabel={`Emergency status: ${activeEmergency.status.replace(/_/g, " ")}`}>
                {isTerminal ? (
                  <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary }}>
                    {activeEmergency.status === "completed"
                      ? t("ambulance.status_completed")
                      : activeEmergency.status === "cancelled"
                        ? t("ambulance.terminal_cancelled")
                        : t("ambulance.terminal_no_accept")}
                  </Text>
                ) : (
                  STATUS_STEPS.map((step, i) => (
                    <View key={step.key} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
                      <Ionicons
                        name={i <= statusIndex ? "checkmark-circle" : "ellipse-outline"}
                        size={18}
                        color={i <= statusIndex ? colors.danger : textSecondary}
                      />
                      <Text
                        style={{
                          fontSize: 14,
                          fontFamily: i === statusIndex ? "JakartaSemiBold" : "Jakarta",
                          color: i <= statusIndex ? textPrimary : textSecondary,
                          marginLeft: 8,
                        }}
                      >
                        {t(step.labelKey)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
              {/* C9-1: F-19 escalation state — the sweeper stamped
                  escalated_at ONCE, re-broadcast wider, and notified the
                  requester. Keyed on escalated_at (already in the REST
                  detail payload the screen polls), not on status: the
                  request is still broadcasting, just searching wider. */}
              {!isTerminal && activeEmergency.escalated_at ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                  <Ionicons name="expand" size={16} color={colors.amber} />
                  <Text style={{ fontSize: 13, fontFamily: "JakartaSemiBold", color: colors.amber, marginLeft: 8, flex: 1 }}>
                    {t("ambulance.escalated_note")}
                  </Text>
                </View>
              ) : null}
              <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 8 }}>
                {activeEmergency.service_level} · {activeEmergency.pickup_address}
              </Text>
            </View>

            {!isTerminal && (
              <TouchableOpacity
                onPress={handleCancel}
                disabled={cancelling}
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor: colors.danger, borderRadius: 12, height: 48, alignItems: "center", justifyContent: "center", marginBottom: 40 }}
                accessibilityRole="button"
                accessibilityLabel={t("ambulance.a11y_cancel")}
               testID="customer.ambulance.emergency.handle-cancel">
                {cancelling ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <Text style={{ color: colors.danger, fontSize: 15, fontFamily: "JakartaSemiBold" }}>
                    {t("ambulance.cancel_cta")}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            {/* Service level */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("ambulance.service_level")}
            </Text>
            <View style={{ flexDirection: "row", marginBottom: 16 }}>
              {(["BLS", "ALS"] as const).map((lvl) => (
                <TouchableOpacity
                  key={lvl}
                  onPress={() => setServiceLevel(lvl)}
                  accessibilityRole="button"
                  accessibilityLabel={`Service level ${lvl}`}
                  accessibilityState={{ selected: serviceLevel === lvl }}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor: serviceLevel === lvl ? colors.danger + "18" : surfaceBg,
                    borderWidth: 2,
                    borderColor: serviceLevel === lvl ? colors.danger : borderColor,
                    borderRadius: 12,
                    marginRight: lvl === "BLS" ? 8 : 0,
                  }}
                 testID="customer.ambulance.emergency.set-service-level">
                  <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: serviceLevel === lvl ? colors.danger : textSecondary }}>
                    {lvl}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                    {lvl === "BLS" ? t("ambulance.bls_desc") : t("ambulance.als_desc")}
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
                marginBottom: 16,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("ambulance.a11y_paramedic")}
              accessibilityState={{ selected: requiresParamedic }}
             testID="customer.ambulance.emergency.set-requires-paramedic">
              <Ionicons
                name={requiresParamedic ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={requiresParamedic ? colors.danger : textSecondary}
              />
              <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 12 }}>
                {t("ambulance.paramedic_required")}
              </Text>
            </TouchableOpacity>

            {/* Patient condition — stored, NEVER broadcast (F41) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
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
                marginBottom: 16,
              }}
              placeholder={t("ambulance.patient_condition_placeholder")}
              placeholderTextColor={textSecondary}
              value={patientCondition}
              onChangeText={setPatientCondition}
              multiline
              accessibilityLabel={t("ambulance.patient_condition")}
             testID="customer.ambulance.emergency.set-patient-condition"/>

            {/* Pickup — POI/map picker (Stage-3 ensure prefills the default;
                the picker is the explicit-adjust path) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("ambulance.pickup_location")}
            </Text>
            <TouchableOpacity
              onPress={openPickupPicker}
              accessibilityRole="button"
              accessibilityLabel={t("ambulance.pickup_address")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 16,
              }}
             testID="customer.ambulance.emergency.open-pickup-picker">
              <Ionicons name="locate-outline" size={20} color={colors.danger} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: "Jakarta", color: pickup ? textPrimary : textSecondary }} numberOfLines={1}>
                  {pickup?.address || t("ambulance.pickup_placeholder")}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={textSecondary} />
            </TouchableOpacity>

            {/* Dropoff (optional — POI/map picker, clearable) */}
            <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
              {t("ambulance.dropoff_optional")}
            </Text>
            <TouchableOpacity
              onPress={openDropoffPicker}
              accessibilityRole="button"
              accessibilityLabel={t("ambulance.dropoff_address")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 14,
                marginBottom: 20,
              }}
             testID="customer.ambulance.emergency.open-dropoff-picker">
              <Ionicons name="location" size={20} color={colors.danger} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: "Jakarta", color: dropoff ? textPrimary : textSecondary }} numberOfLines={1}>
                  {dropoff?.address || t("ambulance.dropoff_placeholder")}
                </Text>
              </View>
              {dropoff ? (
                <TouchableOpacity
                  onPress={clearDropoff}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                 testID="customer.ambulance.emergency.clear-dropoff">
                  <Ionicons name="close-circle" size={18} color={textSecondary} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={textSecondary} />
              )}
            </TouchableOpacity>

            {/* §7 explicit health consent — required when notes are entered. */}
            <TouchableOpacity
              onPress={() => setHealthConsent((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                padding: 14,
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor: healthConsent ? colors.danger : borderColor,
                borderRadius: 12,
                marginBottom: 16,
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: healthConsent }}
              accessibilityLabel={t("ambulance.health_consent")}
             testID="customer.ambulance.emergency.set-health-consent">
              <Ionicons
                name={healthConsent ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={healthConsent ? colors.danger : textSecondary}
              />
              <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary, marginLeft: 12, flex: 1 }}>
                {t("ambulance.health_consent")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCreate}
              disabled={submitting || !pickup || !patientCondition}
              style={{
                backgroundColor: colors.danger,
                borderRadius: 12,
                height: 56,
                alignItems: "center",
                justifyContent: "center",
                opacity: submitting || !pickup || !patientCondition ? 0.5 : 1,
                marginBottom: 40,
              }}
              accessibilityRole="button"
              accessibilityLabel={t("ambulance.a11y_call_now")}
             testID="customer.ambulance.emergency.handle-create">
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                  {t("ambulance.call_now")}
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* ── Location picker modal (POI search + map pin, ride-home machinery) ── */}
      <Modal
        visible={pickerTarget !== null}
        animationType="slide"
        onRequestClose={closePicker}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? colors.bgDark : colors.bgLight }}>
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
            <TouchableOpacity onPress={closePicker} testID="customer.ambulance.emergency.close-picker">
              <Ionicons name="close" size={24} color={textPrimary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
              {pickerTarget === "pickup"
                ? t("ambulance.pickup_location")
                : t("ambulance.dropoff_optional")}
            </Text>
          </View>

          {/* POI search — resolves to a commit on selection. */}
          <View style={{ paddingHorizontal: 20 }}>
            <BarikoiAutocomplete
              initialLocation={
                pickerTarget === "pickup"
                  ? t("ambulance.pickup_placeholder")
                  : t("ambulance.dropoff_placeholder")
              }
              handlePress={handleSuggestionPicked}
            />
          </View>

          {/* Map pin selection — tap to drop a pin, reverse geocode it. */}
          <View style={{ paddingHorizontal: 20 }}>
            <View style={{ borderRadius: 16, overflow: "hidden", height: 300 }}>
              <Map onMapPress={handlePickerMapPress} />
            </View>
            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
              }}
            >
              <Text style={{ fontSize: 13, fontFamily: "Jakarta", color: textSecondary }} numberOfLines={2}>
                {pickerPinLoading
                  ? t("rider_home.getting_address")
                  : pickerPin
                    ? pickerPinAddress || `${pickerPin.lat.toFixed(4)}, ${pickerPin.lng.toFixed(4)}`
                    : t("rider_home.tap_location")}
              </Text>
            </View>

            {/* Confirm the dropped pin into the target field */}
            <TouchableOpacity
              style={{
                marginTop: 16,
                backgroundColor: pickerPin ? colors.danger : colors.danger + "40",
                borderRadius: 12,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={confirmPicked}
              disabled={!pickerPin}
             testID="customer.ambulance.emergency.confirm-picked">
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                {t("delivery_create.confirm_location")}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
