import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface PayoutMethod {
  id: string;
  method_type: string;
  account_number: string;
  account_name: string | null;
  is_default: boolean;
  is_active: boolean;
}

/** bKash number validation: must be 11 digits starting with 01 */
const BKASH_REGEX = /^01\d{9}$/;
const formatBkashDisplay = (num: string) => {
  const d = num.replace(/\D/g, "");
  if (d.length <= 4) return d;
  if (d.length <= 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 11)}`;
};

export default function PayoutMethodScreen() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [current, setCurrent] = useState<PayoutMethod | null>(null);
  const [accountNumber, setAccountNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchMethod = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch(`${API_URL}/api/driver/payout-method`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("Failed to load payout method");
        return;
      }
      const data = await res.json();
      const method = data.payout_method as PayoutMethod | null;
      setCurrent(method);
      if (method) {
        setAccountNumber(method.account_number);
      }
    } catch (e) {
      logger.error("[payout-method] fetch error", e);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMethod();
  }, [fetchMethod]);

  const handleSave = async () => {
    const digits = accountNumber.replace(/\D/g, "");
    if (!BKASH_REGEX.test(digits)) {
      Alert.alert(
        "Invalid Number",
        "Please enter a valid bKash number (01XXXXXXXXX, 11 digits)",
      );
      return;
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Error", "Not authenticated");
        return;
      }

      const res = await fetch(`${API_URL}/api/driver/payout-method`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ account_number: digits }),
      });

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message ?? "Failed to save payout method");
        return;
      }

      const data = await res.json();
      setCurrent(data.payout_method);
      setAccountNumber(digits);
      Alert.alert("Saved", "Your bKash payout method has been updated", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      logger.error("[payout-method] save error", e);
      Alert.alert("Error", "Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const digits = accountNumber.replace(/\D/g, "");
  const isValid = BKASH_REGEX.test(digits);
  const hasChanges = current
    ? digits !== current.account_number
    : digits.length > 0;

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text
          className="text-base font-JakartaBold mt-4 text-center"
          style={{ color: textPrimary }}
        >
          {error}
        </Text>
        <TouchableOpacity
          className="mt-4 px-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.primary }}
          onPress={fetchMethod}
          accessibilityRole="button"
          accessibilityLabel="Retry loading payout method"
        >
          <Text className="text-white font-JakartaBold text-sm">Retry</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-5 py-4 border-b"
        style={{ borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-3"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="text-[18px] font-JakartaBold flex-1"
          style={{ color: textPrimary }}
        >
          Payout Method
        </Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={20}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1 px-5"
          contentContainerStyle={{ paddingVertical: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Current method card */}
          {current && (
            <View
              className="rounded-xl p-4 mb-5"
              style={{
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
              }}
            >
              <View className="flex-row items-center mb-2">
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={colors.primary}
                />
                <Text
                  className="text-sm font-JakartaBold ml-2"
                  style={{ color: textPrimary }}
                >
                  Active Payout Method
                </Text>
              </View>
              <Text className="text-xs" style={{ color: textSecondary }}>
                bKash — {formatBkashDisplay(current.account_number)}
              </Text>
              {current.account_name && (
                <Text className="text-xs mt-1" style={{ color: textSecondary }}>
                  Name: {current.account_name}
                </Text>
              )}
            </View>
          )}

          {/* Info card */}
          <View
            className="rounded-xl p-4 mb-5"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <View className="flex-row items-center mb-2">
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={colors.primary}
              />
              <Text
                className="text-sm font-JakartaBold ml-2"
                style={{ color: textPrimary }}
              >
                bKash Payout
              </Text>
            </View>
            <Text
              className="text-xs leading-5"
              style={{ color: textSecondary }}
            >
              Earnings are paid out to your bKash account. Enter your 11-digit
              bKash personal account number starting with 01. Only one active
              payout method is allowed.
            </Text>
          </View>

          {/* Input */}
          <Text
            className="text-xs font-JakartaSemiBold mb-2 uppercase"
            style={{ color: textSecondary }}
          >
            {current ? "Update bKash Number" : "bKash Account Number"}
          </Text>
          <View
            className="flex-row items-center rounded-xl px-4 py-3 mb-2"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: digits.length > 0 && !isValid ? colors.danger : borderColor,
            }}
          >
            <Text
              className="text-sm font-JakartaBold mr-3"
              style={{ color: textSecondary }}
            >
              +880
            </Text>
            <TextInput
              className="flex-1 text-[15px]"
              style={{ color: textPrimary }}
              placeholder="01XXXXXXXXX"
              placeholderTextColor={colors.textDisabledDark}
              value={accountNumber}
              onChangeText={(v) =>
                setAccountNumber(v.replace(/[^0-9]/g, "").slice(0, 11))
              }
              keyboardType="number-pad"
              maxLength={11}
              autoComplete="tel-national"
              accessibilityLabel="bKash account number"
            />
            {digits.length > 0 && (
              <Ionicons
                name={isValid ? "checkmark-circle" : "close-circle"}
                size={20}
                color={isValid ? colors.primary : colors.danger}
              />
            )}
          </View>
          {digits.length > 0 && !isValid && (
            <Text className="text-xs mb-4" style={{ color: colors.danger }}>
              Must be 11 digits starting with 01
            </Text>
          )}
          {digits.length === 0 && (
            <Text className="text-xs mb-4" style={{ color: textSecondary }}>
              Enter your 11-digit bKash personal number
            </Text>
          )}

          {/* Save button */}
          <TouchableOpacity
            className="rounded-xl py-4 items-center mt-2"
            style={{
              backgroundColor:
                hasChanges && isValid ? colors.primary : colors.textDisabledDark,
            }}
            onPress={handleSave}
            disabled={!hasChanges || !isValid || saving}
            accessibilityRole="button"
            accessibilityLabel="Save payout method"
            accessibilityState={{ disabled: !hasChanges || !isValid || saving }}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text className="text-white font-JakartaBold text-[15px]">
                {current ? "Update Payout Method" : "Add Payout Method"}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
