/**
 * Bid submit screen — fleet staff enters price + overtime_rate_bdt + notes
 * to submit a bid on a rental request.
 *
 * Rule 15: overtime_rate_bdt is integer paisa, display-only for the customer.
 * Rule 16: vehicle_type must include the five car classes for car_rental.
 *
 * Route: /(rental-bidder)/bid-submit?requestId=...&category=...
 */
import { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { describeVehicleType } from "@/constants/truckCatalog";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

/** Vehicle types available for bidding, grouped by category. */
const CAR_VEHICLE_TYPES = [
  "car_compact",
  "car_economy",
  "car_comfort",
  "car_premium",
  "car_xl",
] as const;

const TRUCK_VEHICLE_TYPES = [
  "pickup",
  "mini_truck",
  "medium_truck",
  "heavy_truck",
  "trailer",
  "van",
] as const;

interface RequestDetail {
  id: string;
  category: string;
  pickup_address: string;
  dropoff_address: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number | null;
  dropoff_lng: number | null;
  requested_vehicle_type: string | null;
  tracking_required: boolean;
  rental_options: string | null;
  scheduled_start_at: string | null;
  duration_hours: number | null;
  cargo_tags: string[] | null;
  urgency: string;
  soft_deadline_at: string;
  status: string;
}

export default function BidSubmitScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const params = useLocalSearchParams<{
    requestId: string;
    category?: string;
  }>();
  const requestId = params.requestId ?? "";
  const category = params.category ?? "car_rental";

  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Bid form
  const [selectedVehicleType, setSelectedVehicleType] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState(""); // in taka, displayed to user
  const [overtimeInput, setOvertimeInput] = useState(""); // per-hour taka
  const [notes, setNotes] = useState("");

  const isTruck = category === "truck_rental";
  const vehicleTypes = isTruck ? TRUCK_VEHICLE_TYPES : CAR_VEHICLE_TYPES;

  // Fetch request details
  useEffect(() => {
    if (!requestId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch(`${SERVER_URL}/api/rental/requests/${requestId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setRequest(data.request);
          // Pre-select requested vehicle type if specified
          if (data.request?.requested_vehicle_type) {
            setSelectedVehicleType(data.request.requested_vehicle_type);
          }
        }
      } catch (err) {
        logger.error("[bid-submit] fetch error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [requestId]);

  // Parse price input to paisa
  const priceTaka = parseFloat(priceInput) || 0;
  const pricePaisa = Math.round(priceTaka * 100);
  const overtimeTaka = parseFloat(overtimeInput) || 0;
  const overtimePaisa = Math.round(overtimeTaka * 100);

  const canSubmit =
    selectedVehicleType !== null &&
    pricePaisa > 0 &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !requestId) return;

    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const body: Record<string, unknown> = {
        request_id: requestId,
        vehicle_type: selectedVehicleType,
        quoted_price_bdt: pricePaisa,
      };

      // Ruling 15: overtime_rate_bdt — integer paisa, display-only info
      if (overtimePaisa > 0) {
        body.overtime_rate_bdt = overtimePaisa;
      }

      if (notes.trim()) {
        body.quoted_notes = notes.trim();
      }

      // For tracking-required requests, fleet must pre-select driver+vehicle
      // (this is handled on the assignment screen after the bid is accepted)
      // For non-tracking: just the price + vehicle type

      const res = await fetch(`${SERVER_URL}/api/rental/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        Alert.alert(t("rental_bid_submit.err_title"), data.message || t("rental_bid_submit.err_body"));
        return;
      }

      Alert.alert(t("rental_bid_submit.submitted_title"), t("rental_bid_submit.submitted_body"), [
        { text: t("common.ok"), onPress: () => router.back() },
      ]);
    } catch (err) {
      logger.error("[bid-submit] error", err);
      Alert.alert(t("common.error"), t("rental_bid_submit.err_body"));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.rental-bidder.bid-submit.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {t("rental_bid_submit.title")}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} keyboardShouldPersistTaps="handled">
          {/* Request summary card */}
          {request && (
            <View
              style={{
                backgroundColor: surfaceBg,
                borderRadius: 14,
                padding: 16,
                marginBottom: 20,
                borderWidth: 1,
                borderColor,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                <Ionicons name="location" size={18} color={colors.primary} />
                <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary, marginLeft: 8 }}>
                  {request.pickup_address}
                </Text>
              </View>
              {request.dropoff_address && (
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
                  <Ionicons name="flag" size={18} color={colors.danger} />
                  <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary, marginLeft: 8 }}>
                    {request.dropoff_address}
                  </Text>
                </View>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8, gap: 6 }}>
                <View style={{ backgroundColor: colors.primary + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.primary }}>
                    {describeVehicleType(request.requested_vehicle_type ?? category)}
                  </Text>
                </View>
                {request.tracking_required && (
                  <View style={{ backgroundColor: colors.amber + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.amber }}>
                      {t("rental_bid_submit.chip_tracking")}
                    </Text>
                  </View>
                )}
                {request.scheduled_start_at && (
                  <View style={{ backgroundColor: colors.blue + "18", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                    <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.blue }}>
                      {t("rental_bid_submit.chip_scheduled")}
                    </Text>
                  </View>
                )}
              </View>
              {request.rental_options && (
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 8 }}>
                  {t("rental_bid_submit.options_label", { options: request.rental_options })}
                </Text>
              )}
              {request.duration_hours && (
                <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginTop: 2 }}>
                  {t("rental_bid_submit.duration_label", { hours: request.duration_hours })}
                </Text>
              )}
            </View>
          )}

          {/* Vehicle type selector */}
          <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
            {t("rental_bid_submit.vehicle_type")}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 20 }}>
            {vehicleTypes.map((vt) => {
              const isSelected = selectedVehicleType === vt;
              return (
                <TouchableOpacity
                  key={vt}
                  onPress={() => setSelectedVehicleType(vt)}
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
                  accessibilityLabel={describeVehicleType(vt)}
                  accessibilityState={{ selected: isSelected }}
                 testID="customer.rental-bidder.bid-submit.set-selected-vehicle-type">
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: isSelected ? "JakartaSemiBold" : "JakartaMedium",
                      color: isSelected ? colors.primary : textSecondary,
                    }}
                  >
                    {describeVehicleType(vt)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Price input */}
          <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
            {t("rental_bid_submit.bid_price")}
          </Text>
          <TextInput
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 14,
              color: textPrimary,
              fontSize: 18,
              fontFamily: "JakartaBold",
              marginBottom: 4,
            }}
            placeholder={t("rental_bid_submit.price_placeholder")}
            placeholderTextColor={textSecondary}
            value={priceInput}
            onChangeText={setPriceInput}
            keyboardType="number-pad"
            accessibilityLabel={t("rental_bid_submit.a11y_price")}
           testID="customer.rental-bidder.bid-submit.set-price-input"/>
          {pricePaisa > 0 && (
            <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginBottom: 16 }}>
              {t("rental_bid_submit.paisa_echo", { paisa: pricePaisa.toLocaleString() })}
            </Text>
          )}

          {/* Overtime rate (ruling 15) — display-only info for customer */}
          <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 4 }}>
            {t("rental_bid_submit.overtime_label")}
          </Text>
          <Text style={{ fontSize: 12, fontFamily: "Jakarta", color: textSecondary, marginBottom: 8 }}>
            {t("rental_bid_submit.overtime_hint")}
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
              marginBottom: 20,
            }}
            placeholder={t("rental_bid_submit.overtime_placeholder")}
            placeholderTextColor={textSecondary}
            value={overtimeInput}
            onChangeText={setOvertimeInput}
            keyboardType="number-pad"
            accessibilityLabel={t("rental_bid_submit.a11y_overtime")}
           testID="customer.rental-bidder.bid-submit.set-overtime-input"/>

          {/* Notes */}
          <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
            {t("rental_bid_submit.notes_label")}
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
              marginBottom: 24,
            }}
            placeholder={t("rental_bid_submit.notes_placeholder")}
            placeholderTextColor={textSecondary}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={500}
            accessibilityLabel={t("rental_bid_submit.a11y_notes")}
           testID="customer.rental-bidder.bid-submit.set-notes"/>

          {/* Submit button */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: canSubmit ? colors.primary : colors.primary + "40",
              borderRadius: 12,
              height: 56,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 40,
            }}
            accessibilityRole="button"
            accessibilityLabel={t("rental_bid_submit.a11y_submit")}
           testID="customer.rental-bidder.bid-submit.handle-submit">
            {submitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontFamily: "JakartaSemiBold" }}>
                {pricePaisa > 0 ? t("rental_bid_submit.cta_with_price", { amount: priceTaka.toFixed(0) }) : t("rental_bid_submit.cta")}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
