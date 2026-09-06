import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { formatBDT, formatDateTime } from "@/lib/format";
import EmptyState from "@/components/EmptyState";
import { useTranslation } from "react-i18next";

interface RideSummary {
  id: string;
  created_at: string;
  origin_address: string | null;
  destination_address: string | null;
  rider_payable_bdt: number | null;
  driver_fare_bdt: number | null;
  fare_bdt: number;
}

const DISPUTE_REASONS: { value: string; label: string }[] = [
  { value: "route_longer", label: "Route was longer than expected" },
  { value: "wrong_vehicle", label: "Wrong vehicle type" },
  { value: "wait_fee_unfair", label: "Waiting fee was unfair" },
  { value: "other", label: "Other" },
];

const MIN_DETAILS = 20;
const MAX_DETAILS = 1000;

export default function FareDispute() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const skeletonBg = isDark ? colors.darkSecondary : colors.gray100;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const [ride, setRide] = useState<RideSummary | null>(null);
  const [rideLoading, setRideLoading] = useState(!!rideId);
  const [rideError, setRideError] = useState("");

  const [expectedFare, setExpectedFare] = useState("");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const expectedFareTaka = parseInt(expectedFare, 10);
  const fareValid = Number.isFinite(expectedFareTaka) && expectedFareTaka > 0;
  const detailsValid = details.trim().length >= MIN_DETAILS;
  const formValid = !!rideId && reason !== "" && fareValid && detailsValid;

  const fetchRide = useCallback(async () => {
    if (!rideId) return;
    setRideLoading(true);
    setRideError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setRideError(t('fare_dispute.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/ride/${rideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRideError(data.message || data.error || t('fare_dispute.failed_to_load_ride'));
        return;
      }
      setRide(data.ride ?? null);
    } catch (err) {
      setRideError(t('fare_dispute.network_error'));
      logger.error("[fare-dispute] ride fetch failed", err);
    } finally {
      setRideLoading(false);
    }
  }, [rideId, t]);

  useEffect(() => {
    fetchRide();
  }, [fetchRide]);

  const chargedFarePaisa = ride
    ? ride.rider_payable_bdt ?? ride.fare_bdt ?? ride.driver_fare_bdt ?? 0
    : 0;

  const handleSubmit = async () => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('fare_dispute.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/rider/fare-disputes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ride_id: rideId,
          claimed_fare_bdt: expectedFareTaka * 100,
          dispute_reason: reason,
          rider_note: details.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || t('fare_dispute.failed_to_submit'));
        return;
      }
      const refund = typeof data.refund_bdt === "number" ? data.refund_bdt : 0;
      Alert.alert(
        t('fare_dispute.dispute_submitted_title'),
        refund > 0
          ? t('fare_dispute.refund_approved', { amount: formatBDT(refund) })
          : t('fare_dispute.will_review'),
        [{ text: t('common.confirm'), onPress: () => router.back() }],
      );
    } catch (err) {
      setError(t('fare_dispute.network_error'));
      logger.error("[fare-dispute] submit failed", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!rideId) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={24} color={textPrimary} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {t('fare_dispute.title')}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={t('fare_dispute.toggle_theme')}
            onPress={() => setTheme(isDark ? "light" : "dark")}
            hitSlop={8}
          >
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="alert-circle-outline"
            title={t('fare_dispute.no_ride_title')}
            subtitle={t('fare_dispute.no_ride_subtitle')}
            actionLabel={t('common.back')}
            onAction={() => router.back()}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => router.back()}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {t('fare_dispute.title')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fare_dispute.toggle_theme')}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('fare_dispute.section_ride')}</Text>
        {rideLoading ? (
          <View style={[styles.rideCard, { backgroundColor: surfaceBg, borderColor }]}>
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "50%" }]} />
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "85%" }]} />
            <View style={[styles.skeletonLine, { backgroundColor: skeletonBg, width: "70%" }]} />
          </View>
        ) : rideError ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{rideError}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('fare_dispute.retry_load_a11y')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={fetchRide}
              disabled={rideLoading}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : ride ? (
          <View style={[styles.rideCard, { backgroundColor: surfaceBg, borderColor }]}>
            <Text style={[styles.rideDate, { color: textSecondary }]}>
              {formatDateTime(ride.created_at)}
            </Text>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.routeText, { color: textPrimary }]} numberOfLines={1}>
                {ride.origin_address ?? "Pickup"}
              </Text>
            </View>
            <View style={styles.routeRow}>
              <View style={[styles.routeDot, { backgroundColor: colors.danger }]} />
              <Text style={[styles.routeText, { color: textPrimary }]} numberOfLines={1}>
                {ride.destination_address ?? "Destination"}
              </Text>
            </View>
            <View style={[styles.fareRow, { borderTopColor: borderColor }]}>
              <Text style={[styles.fareLabel, { color: textSecondary }]}>{t('fare_dispute.fare_charged')}</Text>
              <Text style={[styles.fareValue, { color: textPrimary }]}>
                {formatBDT(chargedFarePaisa)}
              </Text>
            </View>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('fare_dispute.expected_fare')}</Text>
        <View style={[styles.fareInputRow, { backgroundColor: surfaceBg, borderColor }]}>
          <Text style={[styles.farePrefix, { color: textSecondary }]}>৳</Text>
          <TextInput
            style={[styles.fareInput, { color: textPrimary }]}
            placeholder={t('fare_dispute.zero_placeholder')}
            placeholderTextColor={textDisabled}
            value={expectedFare}
            onChangeText={(text) => setExpectedFare(text.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            accessibilityLabel={t('fare_dispute.expected_fare_a11y')}
          />
        </View>
        <Text style={[styles.helperText, { color: textSecondary }]}>
          {t('fare_dispute.what_should_you_pay')}
        </Text>

        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('fare_dispute.reason')}</Text>
        <View style={styles.chipWrap}>
          {DISPUTE_REASONS.map((r) => {
            const selected = reason === r.value;
            return (
              <TouchableOpacity
                key={r.value}
                accessibilityRole="button"
                accessibilityLabel={t('fare_dispute.reason_a11y', { label: r.label })}
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : surfaceBg,
                    borderColor: selected ? colors.primary : borderColor,
                  },
                ]}
                onPress={() => setReason(r.value)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.white : textSecondary },
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: textSecondary }]}>{t('fare_dispute.details')}</Text>
        <TextInput
          style={[
            styles.detailsInput,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder={t('fare_dispute.explain_placeholder')}
          placeholderTextColor={textDisabled}
          value={details}
          onChangeText={setDetails}
          multiline
          maxLength={MAX_DETAILS}
        />
        <View style={styles.counterRow}>
          {details.length > 0 && !detailsValid ? (
            <Text style={[styles.helperText, { color: textSecondary }]}>
              {t('fare_dispute.more_chars_needed', { count: MIN_DETAILS - details.length })}
            </Text>
          ) : (
            <View />
          )}
          <Text style={[styles.counterText, { color: textDisabled }]}>
            {details.length}/{MAX_DETAILS}
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('fare_dispute.retry_submit_a11y')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={handleSubmit}
              disabled={submitting || !formValid}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('fare_dispute.submit_a11y')}
          accessibilityState={{ disabled: !formValid || submitting }}
          style={[
            styles.submitButton,
            { backgroundColor: formValid ? colors.primary : textDisabled },
          ]}
          onPress={handleSubmit}
          disabled={!formValid || submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{t('fare_dispute.submit_dispute')}</Text>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    textAlign: "center",
  },
  emptyWrap: { flex: 1, justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  sectionLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginBottom: 8,
  },
  rideCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  rideDate: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  routeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeText: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 2,
  },
  fareLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  fareValue: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
  },
  fareInputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    gap: 8,
  },
  farePrefix: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  fareInput: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    paddingVertical: 14,
  },
  helperText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 6,
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  detailsInput: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    textAlignVertical: "top",
  },
  counterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 12,
    minHeight: 14,
  },
  counterText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  errorBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  retryButton: {
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 20,
  },
  retryText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  submitButton: {
    height: 56,
    borderRadius: 1000,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  submitButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    color: colors.white,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
});
