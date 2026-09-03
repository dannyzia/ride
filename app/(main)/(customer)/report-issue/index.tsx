import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useTranslation } from "react-i18next";

const CATEGORIES = [
  "Driver behaviour",
  "Route issue",
  "Fare dispute",
  "Safety concern",
  "Lost item",
  "Technical issue",
  "Other",
];

const MIN_DESCRIPTION = 20;
const MAX_DESCRIPTION = 500;

export default function ReportIssue() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { rideId } = useLocalSearchParams<{ rideId?: string }>();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  const trimmedDescription = description.trim();
  const descriptionValid = trimmedDescription.length >= MIN_DESCRIPTION;
  const formValid = category !== "" && descriptionValid;

  const handleSubmit = async () => {
    if (!formValid || loading) return;
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('report_issue.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          subject: `Issue: ${category}`,
          description: trimmedDescription,
          ...(rideId ? { ride_id: rideId } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || t('report_issue.failed_to_submit'));
        return;
      }
      setShowSuccess(true);
    } catch (err) {
      setError(t('report_issue.network_error'));
      logger.error("[report-issue] submit failed", err);
    } finally {
      setLoading(false);
    }
  };

  const closeSuccess = () => {
    setShowSuccess(false);
    router.back();
  };

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
          {t('ride.report_an_issue')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('report_issue.toggle_theme')}
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
        {rideId ? (
          <View style={[styles.rideChip, { backgroundColor: colors.infoLight }]}>
            <Ionicons name="car-outline" size={16} color={colors.info} />
            <Text style={[styles.rideChipText, { color: colors.info }]} numberOfLines={1}>
              {t('report_issue.regarding_recent_ride')}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('ride.category')}</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.map((c) => {
            const selected = category === c;
            return (
              <TouchableOpacity
                key={c}
                accessibilityRole="button"
                accessibilityLabel={t('report_issue.issue_type_a11y', { type: c })}
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : surfaceBg,
                    borderColor: selected ? colors.primary : borderColor,
                  },
                ]}
                onPress={() => setCategory(c)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.white : textSecondary },
                  ]}
                >
                  {c}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.inputLabel, { color: textSecondary }]}>{t('ride.describe_issue')}</Text>
        <TextInput
          style={[
            styles.descriptionInput,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder={t('ride.tell_us_what_happened')}
          placeholderTextColor={textDisabled}
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={MAX_DESCRIPTION}
        />
        <View style={styles.counterRow}>
          {description.length > 0 && !descriptionValid ? (
            <Text style={[styles.helperText, { color: textSecondary }]}>
              {t('report_issue.more_chars_needed', { count: MIN_DESCRIPTION - description.length })}
            </Text>
          ) : (
            <View />
          )}
          <Text style={[styles.counterText, { color: textDisabled }]}>
            {description.length}/{MAX_DESCRIPTION}
          </Text>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('report_issue.retry_a11y')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={handleSubmit}
              disabled={loading || !formValid}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('report_issue.submit_a11y')}
          accessibilityState={{ disabled: !formValid || loading }}
          style={[
            styles.submitButton,
            { backgroundColor: formValid ? colors.primary : textDisabled },
          ]}
          onPress={handleSubmit}
          disabled={!formValid || loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>{t('ride.submit')}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal
        visible={showSuccess}
        transparent
        animationType="fade"
        onRequestClose={closeSuccess}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: surfaceBg }]}>
            <Ionicons name="checkmark-circle" size={64} color={colors.primary} />
            <Text style={[styles.modalTitle, { color: textPrimary }]}>{t('report_issue.report_submitted')}</Text>
            <Text style={[styles.modalSubtitle, { color: textSecondary }]}>
              {t('report_issue.support_will_review')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('report_issue.done_a11y')}
              style={[styles.modalButton, { backgroundColor: colors.primary }]}
              onPress={closeSuccess}
            >
              <Text style={styles.modalButtonText}>{t('report_issue.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  rideChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  rideChipText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  inputLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginBottom: 8,
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
  descriptionInput: {
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
  helperText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    width: "100%",
    gap: 8,
  },
  modalTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginTop: 8,
  },
  modalSubtitle: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
  },
  modalButton: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  modalButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
});
