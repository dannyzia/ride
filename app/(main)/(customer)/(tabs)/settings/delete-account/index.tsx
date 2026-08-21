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

const DELETED_ITEMS = [
  "Your name, phone number and email",
  "Your profile photo",
  "Saved addresses",
  "Ride pickup and destination details",
];

export default function SettingsDeleteAccount() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

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
        setError("Not authenticated. Please sign in again.");
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
        setError(data.message || data.error || "Failed to delete account");
        return;
      }
      await authCleanup();
      await supabase.auth.signOut();
    } catch (err) {
      logger.error("[delete-account] failed", err);
      setError("An error occurred. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeletePress = () => {
    if (!confirmed || isDeleting) return;
    Alert.alert(
      "Are you absolutely sure?",
      "This will permanently erase your account data. This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: performDelete },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
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
          Delete Account
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
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
            This action cannot be undone
          </Text>
        </View>

        <Text style={[styles.explanation, { color: textSecondary }]}>
          Deleting your account erases your personal information from Ride and signs you out
          immediately. You will not be able to recover any of this data.
        </Text>

        <View style={[styles.deletedCard, { backgroundColor: surfaceBg, borderColor }]}>
          <Text style={[styles.deletedTitle, { color: textPrimary }]}>What will be erased</Text>
          {DELETED_ITEMS.map((item) => (
            <View key={item} style={styles.deletedItemRow}>
              <View style={styles.deletedDot} />
              <Text style={[styles.deletedItemText, { color: textSecondary }]}>{item}</Text>
            </View>
          ))}
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry account deletion"
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={handleDeletePress}
              disabled={isDeleting || !confirmed}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={[styles.inputLabel, { color: textSecondary }]}>
          Type DELETE to confirm
        </Text>
        <TextInput
          style={[
            styles.confirmInput,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder="DELETE"
          placeholderTextColor={textDisabled}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete My Account"
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
            <Text style={styles.deleteButtonText}>Delete My Account</Text>
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
