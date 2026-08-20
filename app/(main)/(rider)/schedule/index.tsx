import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Switch, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const DAYS = [
  { key: 1, label: "Monday" },
  { key: 2, label: "Tuesday" },
  { key: 3, label: "Wednesday" },
  { key: 4, label: "Thursday" },
  { key: 5, label: "Friday" },
  { key: 6, label: "Saturday" },
  { key: 0, label: "Sunday" },
];

const DEFAULT_START = "09:00";
const DEFAULT_END = "21:00";

export default function Schedule() {
  const [active, setActive] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/driver/schedule`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (res.ok && !cancelled) {
          const map: Record<number, boolean> = {};
          for (const slot of data.schedule ?? []) {
            map[slot.day_of_week] = slot.is_active;
          }
          setActive(map);
        }
      } catch (err) {
        logger.error("Schedule fetch failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (key: number) => {
    setActive((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const schedule = DAYS.map((d) => ({
        day_of_week: d.key,
        start_time: DEFAULT_START,
        end_time: DEFAULT_END,
        is_active: active[d.key] ?? false,
      }));
      const res = await fetch(`${API_URL}/api/driver/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ schedule }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Schedule save failed", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color="#0CC25F" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Set Availability</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta mb-3" style={{ color: textSecondary }}>Toggle days you are available to drive</Text>
        {DAYS.map((d) => {
          const isActive = active[d.key] ?? false;
          return (
            <View key={d.key} className="flex-row justify-between items-center p-[14px] mb-2 rounded-[12px] border" style={{ backgroundColor: isActive ? surfaceBg : bg, borderColor }}>
              <View className="flex-1">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{d.label}</Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>{isActive ? `${DEFAULT_START} – ${DEFAULT_END}` : "Off"}</Text>
              </View>
              <Switch value={isActive} onValueChange={() => toggle(d.key)} trackColor={{ false: "#D1D5DB", true: "#0CC25F" }} thumbColor="#FFFFFF" />
            </View>
          );
        })}
        {error ? <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text> : null}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mt-4"
          style={{ backgroundColor: colors.primary, opacity: saving ? 0.4 : 1 }}
          onPress={handleSave}
          disabled={saving}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>{saving ? "Saving..." : "Save Schedule"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
