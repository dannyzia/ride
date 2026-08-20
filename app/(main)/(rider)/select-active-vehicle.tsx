import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDriverStore } from "@/store/useDriverStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { Ionicons } from "@expo/vector-icons";

export default function SelectActiveVehicle() {
  const { driver, setDriver } = useDriverStore();
  const [selected, setSelected] = useState(driver?.vehicle_type || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const confirm = async () => {
    // Nothing to change — already that vehicle type.
    if (selected === driver?.vehicle_type) {
      router.replace("/(main)/(rider)/");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      // PATCH /api/driver/me strips vehicle_type by design — the real
      // endpoint is vehicle-type-change, which gates eligibility server-side
      // and syncs drivers.vehicle_type + vehicles in one transaction.
      const res = await fetch(`${API_URL}/api/driver/vehicle-type-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_vehicle_type: selected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Stale store vs server — the change is already in effect; treat as success.
        if (err.error === "already_current_type") {
          if (driver) setDriver({ ...driver, vehicle_type: selected as any });
          router.replace("/(main)/(rider)/");
          return;
        }
        setError(err.message || err.error || "Failed to change vehicle type");
        return;
      }
      if (driver) setDriver({ ...driver, vehicle_type: selected as any });
      router.replace("/(main)/(rider)/");
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      {/* Header */}
      <View
        className="flex-row items-center px-6 py-4 border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaSemiBold"
          style={{ color: textPrimary }}
        >
          Select Vehicle
        </Text>
        <View className="w-6" />
      </View>

      {/* Vehicle List */}
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingVertical: 16, gap: 10 }}
      >
        {VEHICLE_TYPES.map((v) => (
          <TouchableOpacity
            key={v.key}
            className="flex-row items-center p-4 rounded-xl border"
            style={{
              backgroundColor: selected === v.key ? colors.primaryLight : surfaceBg,
              borderColor: selected === v.key ? colors.primary : borderColor,
              borderWidth: selected === v.key ? 2 : 1,
            }}
            onPress={() => setSelected(v.key)}
          >
            {/* Radio circle */}
            <View
              className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
              style={{
                borderColor: selected === v.key ? colors.primary : borderColor,
              }}
            >
              {selected === v.key && (
                <View
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
              )}
            </View>

            {/* Vehicle info */}
            <View className="flex-1">
              <Text
                className="text-[16px] font-JakartaBold"
                style={{ color: textPrimary }}
              >
                {v.display_en}
              </Text>
              <Text
                className="text-[14px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                {v.seats} seats{v.has_ac === true ? " · AC" : v.has_ac === false ? " · No AC" : ""}
              </Text>
            </View>

            {/* Checkmark for selected */}
            {selected === v.key && (
              <Ionicons name="checkmark" size={20} color={colors.primary} />
            )}
          </TouchableOpacity>
        ))}

        {/* Error */}
        {error ? (
          <Text
            className="text-[14px] font-Jakarta text-center mt-2"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}

        {/* Confirm button */}
        <TouchableOpacity
          className="rounded-full py-4 items-center mt-4"
          style={{
            backgroundColor: !selected || saving ? colors.textDisabledDark : colors.primary,
            opacity: !selected || saving ? 0.5 : 1,
          }}
          onPress={confirm}
          disabled={!selected || saving}
        >
          {saving ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>
              Confirm & Go Online
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}