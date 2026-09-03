import { useState } from "react";
import {
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { authCleanup } from "@/lib/authCleanup";
import { useTranslation } from "react-i18next";

const DELETED_ITEMS = [
  "delete_account.item_name",
  "delete_account.item_photo",
  "delete_account.item_addresses",
  "delete_account.item_ride_details",
];

export default function SettingsDeleteAccount() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const { t } = useTranslation();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const confirmed = confirmText === "DELETE";

  const performDelete = async () => {
    setIsDeleting(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('delete_account.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/user/delete-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirm: "DELETE MY DATA" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || data.error || t('delete_account.failed'));
        return;
      }
      await authCleanup();
      await supabase.auth.signOut();
    } catch (err) {
      logger.error("[delete-account] failed", err);
      setError(t('delete_account.error_occurred'));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePress = () => {
    if (!confirmed || isDeleting) return;
    Alert.alert(
      t('delete_account.confirm_title'),
      t('delete_account.confirm_message'),
      [
        { text: t('common.cancel'), style: "cancel" },
        { text: t('common.delete'), style: "destructive", onPress: performDelete },
      ],
    );
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
          {t('settings.delete_account')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('delete_account.toggle_theme')}
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
        <View style={[styles.warningBanner, { backgroundColor: `${colors.danger}1A` }]}>
          <Ionicons name="warning" size={24} color={colors.danger} />
          <Text style={[styles.warningText, { color: colors.danger }]}>
            {t('delete_account.cannot_undo')}
          </Text>
        </View>

        <Text style={[styles.explanation, { color: textSecondary }]}>
          {t('delete_account.explanation')}
        </Text>

        <View style={[styles.deletedCard, { backgroundColor: surfaceBg, borderColor }]}>
          <Text style={[styles.deletedTitle, { color: textPrimary }]}>{t('delete_account.what_erased')}</Text>
          {DELETED_ITEMS.map((item) => (
            <View key={item} style={styles.deletedItemRow}>
              <View style={styles.deletedDot} />
              <Text style={[styles.deletedItemText, { color: textSecondary }]}>{t(item)}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('delete_account.retry_a11y')}
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={handleDeletePress}
              disabled={isDeleting || !confirmed}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={[styles.inputLabel, { color: textSecondary }]}>
          {t('delete_account.type_to_confirm')}
        </Text>
        <TextInput
          style={[
            styles.confirmInput,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder={t('delete_account.confirm_phrase')}
          placeholderTextColor={textDisabled}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('delete_account.cta')}
          accessibilityState={{ disabled: !confirmed || isDeleting }}
          style={[
            styles.deleteButton,
            { backgroundColor: confirmed ? colors.danger : textDisabled },
          ]}
          onPress={handleDeletePress}
          disabled={!confirmed || isDeleting}
          activeOpacity={0.8}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.deleteButtonText}>{t('delete_account.cta')}</Text>
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
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 16, paddingTop: 8 },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    padding: 16,
  },
  warningText: {
    flex: 1,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  explanation: {
    fontFamily: "Jakarta-Regular",
    fontSize: 15,
    lineHeight: 22,
  },
  deletedCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  deletedTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
  },
  deletedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deletedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.danger,
  },
  deletedItemText: {
    flex: 1,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  errorBanner: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
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
  inputLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginTop: 8,
  },
  confirmInput: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  deleteButton: {
    height: 56,
    borderRadius: 1000,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  deleteButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    color: colors.white,
  },
});
