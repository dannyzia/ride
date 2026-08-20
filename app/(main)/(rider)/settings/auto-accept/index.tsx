import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, TextInput, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function AutoAcceptSettings() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [enabled, setEnabled] = useState(false);
  const [radius, setRadius] = useState("500");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/driver/me`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const d = data.driver ?? data;
          setEnabled(d.auto_accept_enabled ?? false);
          setRadius(String(d.auto_accept_radius_meters ?? 500));
        }
      } catch (e) { logger.error("Fetch auto-accept failed", e); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    const radiusNum = parseInt(radius, 10);
    if (radiusNum < 100 || radiusNum > 5000) { alert("Radius must be 100-5000 meters"); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      await fetch(`${API_URL}/api/driver/me`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auto_accept_enabled: enabled, auto_accept_radius_meters: radiusNum }),
      });
    } catch (e) { logger.error("Save auto-accept failed", e); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Auto-Accept Rides</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.primary} className="mt-10" /> : (
        <View className="flex-1 px-6 pt-8">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-base font-Jakarta flex-1" style={{ color: textPrimary }}>Auto-accept nearby rides</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: "#2E3038", true: colors.primary }} thumbColor="#FFF" />
          </View>
          <Text className="text-sm font-Jakarta mb-2" style={{ color: textSecondary }}>Max distance (meters)</Text>
          <TextInput className="border rounded-lg px-4 py-3 font-Jakarta text-base mb-2"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            keyboardType="numeric" value={radius} onChangeText={setRadius} placeholder="100-5000" placeholderTextColor={textSecondary} />
          <Text className="text-xs font-Jakarta mb-6" style={{ color: textSecondary }}>Minimum 100m, maximum 5000m. Auto-accept only works with 4.8+ rating.</Text>
          <TouchableOpacity onPress={save} disabled={saving} className={`py-4 rounded-full items-center ${saving ? "bg-goBorderDark" : "bg-goPrimary"}`}>
            <Text className="text-goWhite font-JakartaBold text-base">{saving ? "Saving..." : "Save Settings"}</Text>
          </TouchableOpacity>
        </View>
      )}
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
