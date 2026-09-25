import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";

export default function ChangePassword() {
  const { t } = useTranslation();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const setTheme = useAppearance((s) => s.setTheme);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const formValid =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword === newPassword;

  const handleChange = useCallback(async () => {
    if (newPassword.length < 6) {
      setError(t("change_password.err_min_length"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("change_password.err_mismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user?.phone) {
        setError(t("change_password.err_no_phone"));
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: user.phone,
        password: currentPassword,
      });
      if (signInError) {
        setError(t("change_password.err_wrong_current"));
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      Alert.alert(
        t("change_password.password_updated_title"),
        t("change_password.password_updated_body"),
        [{ text: t("change_password.ok"), onPress: () => router.back() }],
      );
    } catch (err) {
      setError(t("change_password.err_network"));
      logger.error("[change-password] failed", err);
    } finally {
      setLoading(false);
    }
  }, [currentPassword, newPassword, confirmPassword, t]);

  const saveButtonBg = formValid
    ? colors.primary
    : isDark
      ? colors.darkSecondary
      : colors.gray200;

  const renderEye = (
    visible: boolean,
    onToggle: () => void,
    label: string,
    eyeColor: string,
  ) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onToggle}
      style={styles.eyeButton}
    >
      <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={22} color={eyeColor} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.screenHeader}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("change_password.a11y_go_back")}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: textPrimary }]} numberOfLines={1}>
          {t("change_password.title")}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("change_password.a11y_toggle_theme")}
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={styles.themeToggle}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.infoBanner, { backgroundColor: colors.infoLight }]}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.info} />
          <Text style={[styles.infoText, { color: colors.info }]}>
            {t("change_password.info_banner")}
          </Text>
        </View>

        <Text style={[styles.fieldLabel, { color: textSecondary }]}>
          {t("change_password.current_password")}
        </Text>
        <View
          style={[styles.inputWrap, { backgroundColor: surfaceBg, borderColor }]}
        >
          <TextInput
            accessibilityLabel={t("change_password.a11y_current_password")}
            style={[styles.input, { color: textPrimary }]}
            placeholder={t("change_password.current_placeholder")}
            placeholderTextColor={textDisabled}
            secureTextEntry={!showCurrent}
            value={currentPassword}
            onChangeText={setCurrentPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {renderEye(
            showCurrent,
            () => setShowCurrent((v) => !v),
            showCurrent
              ? t("change_password.a11y_hide_current")
              : t("change_password.a11y_show_current"),
            textSecondary,
          )}
        </View>

        <Text style={[styles.fieldLabel, { color: textSecondary }]}>
          {t("change_password.new_password")}
        </Text>
        <View
          style={[styles.inputWrap, { backgroundColor: surfaceBg, borderColor }]}
        >
          <TextInput
            accessibilityLabel={t("change_password.a11y_new_password")}
            style={[styles.input, { color: textPrimary }]}
            placeholder={t("change_password.new_placeholder")}
            placeholderTextColor={textDisabled}
            secureTextEntry={!showNew}
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {renderEye(
            showNew,
            () => setShowNew((v) => !v),
            showNew ? t("change_password.a11y_hide_new") : t("change_password.a11y_show_new"),
            textSecondary,
          )}
        </View>

        <Text style={[styles.fieldLabel, { color: textSecondary }]}>
          {t("change_password.confirm_password")}
        </Text>
        <View
          style={[styles.inputWrap, { backgroundColor: surfaceBg, borderColor }]}
        >
          <TextInput
            accessibilityLabel={t("change_password.a11y_confirm_password")}
            style={[styles.input, { color: textPrimary }]}
            placeholder={t("change_password.confirm_placeholder")}
            placeholderTextColor={textDisabled}
            secureTextEntry={!showConfirm}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {renderEye(
            showConfirm,
            () => setShowConfirm((v) => !v),
            showConfirm
              ? t("change_password.a11y_hide_confirm")
              : t("change_password.a11y_show_confirm"),
            textSecondary,
          )}
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t("change_password.a11y_update_password")}
          onPress={() => void handleChange()}
          disabled={loading || !formValid}
          activeOpacity={0.8}
          style={[styles.saveButton, { backgroundColor: saveButtonBg }]}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text style={styles.saveText}>{t("change_password.update")}</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    minHeight: 56,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    marginLeft: 4,
  },
  themeToggle: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: 24, paddingVertical: 24 },
  infoBanner: {
    flexDirection: "row",
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    lineHeight: 19,
  },
  fieldLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    minHeight: 52,
    paddingHorizontal: 16,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  eyeButton: {
    width: 48,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  saveButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
});
