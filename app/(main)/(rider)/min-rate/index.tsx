import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import MinRateSlider from "@/components/MinRateSlider";
import { validateMinPerKm } from "@/lib/validateMinPerKm";

interface SliderConfig {
  vehicle_type: string;
  system_per_km_bdt: number;
  min_ratio: number;
  max_ratio: number;
  lower_bound: number;
  upper_bound: number;
}

export default function MinRateScreen() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [config, setConfig] = useState<SliderConfig | null>(null);
  const [currentMinPerKm, setCurrentMinPerKm] = useState<number | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchConfig = useCallback(async () => {
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

      // Fetch slider config
      const configRes = await fetch(`${API_URL}/api/driver/slider-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!configRes.ok) {
        setError("Failed to load rate configuration");
        return;
      }
      const configData = await configRes.json();
      setConfig(configData);
      setSliderValue(
        configData.lower_bound ?? configData.system_per_km_bdt ?? 0,
      );

      // Fetch current driver profile for saved min_per_km_bdt
      const meRes = await fetch(`${API_URL}/api/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const meData = await meRes.json();
        const saved = meData.driver?.min_per_km_bdt ?? null;
        setCurrentMinPerKm(saved);
        if (saved != null && saved > 0) {
          setSliderValue(saved);
        }
      }
    } catch (e) {
      logger.error("[min-rate] fetch error", e);
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSave = async () => {
    if (!config) return;

    // Validate against system bounds
    const validation = validateMinPerKm(config.system_per_km_bdt, sliderValue, {
      minRatio: config.min_ratio,
      maxRatio: config.max_ratio,
    });
    if (!validation.valid) {
      Alert.alert("Invalid Rate", validation.error ?? "Rate out of bounds");
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

      const res = await fetch(`${API_URL}/api/driver/me`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ min_per_km_bdt: sliderValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        Alert.alert("Error", data.message ?? "Failed to save rate");
        return;
      }

      setCurrentMinPerKm(sliderValue);
      Alert.alert("Saved", "Your minimum rate has been updated", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      logger.error("[min-rate] save error", e);
      Alert.alert("Error", "Network error — please try again");
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = config && sliderValue !== (currentMinPerKm ?? config.system_per_km_bdt);

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

  if (error || !config) {
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
          {error || "Configuration not available"}
        </Text>
        <TouchableOpacity
          className="mt-4 px-6 py-3 rounded-xl"
          style={{ backgroundColor: colors.primary }}
          onPress={fetchConfig}
          accessibilityRole="button"
          accessibilityLabel="Retry loading rate configuration"
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
          Minimum Rate
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

      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingVertical: 20 }}
      >
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
              How it works
            </Text>
          </View>
          <Text
            className="text-xs leading-5"
            style={{ color: textSecondary }}
          >
            Set your minimum acceptable per-km rate. You will only receive ride
            offers that meet or exceed this rate. The system rate is ৳
            {(config.system_per_km_bdt / 100).toFixed(2)}/km for your vehicle
            type ({config.vehicle_type.replace(/_/g, " ")}).
          </Text>
        </View>

        {/* Slider */}
        <MinRateSlider
          systemPerKmBdt={config.system_per_km_bdt}
          minPerKmBdt={currentMinPerKm}
          onChange={setSliderValue}
        />

        {/* Current vs selected comparison */}
        {currentMinPerKm != null && currentMinPerKm > 0 && (
          <View
            className="rounded-xl p-4 mb-5"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
            }}
          >
            <Text
              className="text-xs font-JakartaSemiBold mb-1"
              style={{ color: textSecondary }}
            >
              CURRENT SETTING
            </Text>
            <Text className="text-sm" style={{ color: textPrimary }}>
              ৳{(currentMinPerKm / 100).toFixed(2)}/km (
              {Math.round((currentMinPerKm / config.system_per_km_bdt) * 100)}%
              of system rate)
            </Text>
          </View>
        )}

        {/* Save button */}
        <TouchableOpacity
          className="rounded-xl py-4 items-center"
          style={{
            backgroundColor: hasChanges ? colors.primary : colors.textDisabledDark,
          }}
          onPress={handleSave}
          disabled={!hasChanges || saving}
          accessibilityRole="button"
          accessibilityLabel="Save minimum rate"
          accessibilityState={{ disabled: !hasChanges || saving }}
        >
          {saving ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text className="text-white font-JakartaBold text-[15px]">
              Save Rate
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
