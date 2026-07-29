import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function AutoAcceptSettings() {
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
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/me`, { headers: { Authorization: `Bearer ${token}` } });
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
      await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/me`, {
        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auto_accept_enabled: enabled, auto_accept_radius_meters: radiusNum }),
      });
    } catch (e) { logger.error("Save auto-accept failed", e); }
    finally { setSaving(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Auto-Accept Rides</Text>
        <View className="w-12" />
      </View>
      {loading ? <ActivityIndicator size="large" color="#0A9B4C" className="mt-10" /> : (
        <View className="flex-1 px-6 pt-8">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-base font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">Auto-accept nearby rides</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: "#2E3038", true: "#0A9B4C" }} thumbColor="#FFF" />
          </View>
          <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Max distance (meters)</Text>
          <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3 text-goTextPrimaryLight dark:text-goTextPrimaryDark font-Jakarta text-base mb-2"
            keyboardType="numeric" value={radius} onChangeText={setRadius} placeholder="100-5000" />
          <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-6">Minimum 100m, maximum 5000m. Auto-accept only works with 4.8+ rating.</Text>
          <TouchableOpacity onPress={save} disabled={saving} className={`py-4 rounded-full items-center ${saving ? "bg-goBorderDark" : "bg-goPrimary"}`}>
            <Text className="text-goWhite font-JakartaBold text-base">{saving ? "Saving..." : "Save Settings"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
