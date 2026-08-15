import { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const RELATIONSHIPS = ["Family", "Friend", "Partner", "Colleague", "Other"];

export default function AddEmergencyContact() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const phoneDigits = phone.replace(/\D/g, "");
  const nameValid = name.trim().length >= 2;
  const phoneValid = phoneDigits.length >= 10 && phoneDigits.length <= 13;
  const formValid = nameValid && phoneValid;

  const handleSave = async () => {
    if (!formValid || saving) return;
    setSaving(true);
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
      const res = await fetch(`${API_URL}/api/user/emergency-contacts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phoneDigits,
          relationship: relationship || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || data.error || "Failed to save contact");
        return;
      }
      Alert.alert("Contact Saved", `${name.trim()} was added to your emergency contacts.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setError("Network error. Please try again.");
      logger.error("[emergency-contacts/add] save failed", err);
    } finally {
      setSaving(false);
    }
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
          Add Contact
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
        <Text style={[styles.inputLabel, { color: textSecondary }]}>Name</Text>
        <TextInput
          style={[
            styles.input,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder="Contact name"
          placeholderTextColor={textDisabled}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
        />

        <Text style={[styles.inputLabel, { color: textSecondary }]}>Phone Number</Text>
        <View style={styles.phoneRow}>
          <View
            style={[
              styles.phonePrefix,
              { backgroundColor: surfaceBg, borderColor },
            ]}
          >
            <Text style={[styles.phonePrefixText, { color: textSecondary }]}>+880</Text>
          </View>
          <TextInput
            style={[
              styles.phoneInput,
              { backgroundColor: surfaceBg, borderColor, color: textPrimary },
            ]}
            placeholder="1XXXXXXXXX"
            placeholderTextColor={textDisabled}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />
        </View>
        {phone.length > 0 && !phoneValid ? (
          <Text style={[styles.helperText, { color: textSecondary }]}>
            Enter a valid number (10–13 digits)
          </Text>
        ) : null}

        <Text style={[styles.inputLabel, { color: textSecondary }]}>Relationship</Text>
        <View style={styles.chipWrap}>
          {RELATIONSHIPS.map((rel) => {
            const selected = relationship === rel;
            return (
              <TouchableOpacity
                key={rel}
                accessibilityRole="button"
                accessibilityLabel={`Relationship ${rel}`}
                accessibilityState={{ selected }}
                style={[
                  styles.chip,
                  {
                    backgroundColor: selected ? colors.primary : surfaceBg,
                    borderColor: selected ? colors.primary : borderColor,
                  },
                ]}
                onPress={() => setRelationship(selected ? "" : rel)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: selected ? colors.white : textSecondary },
                  ]}
                >
                  {rel}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: `${colors.danger}1A` }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Retry saving contact"
              style={[styles.retryButton, { borderColor: colors.danger }]}
              onPress={handleSave}
              disabled={saving || !formValid}
            >
              <Text style={[styles.retryText, { color: colors.danger }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Save Contact"
          accessibilityState={{ disabled: !formValid || saving }}
          style={[
            styles.saveButton,
            { backgroundColor: formValid ? colors.primary : textDisabled },
          ]}
          onPress={handleSave}
          disabled={!formValid || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Save Contact</Text>
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
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  inputLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginBottom: 16,
  },
  phoneRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  phonePrefix: {
    minWidth: 76,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  phonePrefixText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  phoneInput: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
  },
  helperText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 4,
    marginBottom: 12,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
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
  saveButton: {
    height: 56,
    borderRadius: 1000,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    color: colors.white,
  },
});
