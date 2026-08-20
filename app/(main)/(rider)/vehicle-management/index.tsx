import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface Vehicle {
  id: string;
  vehicle_model: string;
  registration_plate: string;
  vehicle_type: string;
  is_active: boolean;
}

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load vehicles"); return; }
      const data = await res.json();
      setVehicles(data.vehicles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Vehicles fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const formatVehicleType = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>My Vehicles</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>{error}</Text>
        ) : vehicles.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-center mt-8" style={{ color: textSecondary }}>No vehicles registered yet.</Text>
        ) : (
          vehicles.map((v) => (
            <View key={v.id} className="p-[14px] border rounded-[12px]" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{v.vehicle_model}</Text>
                {v.is_active && (
                  <View className="rounded-full px-[10px] py-[2px]" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
                    <Text className="text-[12px] font-JakartaBold" style={{ color: colors.primary }}>Active</Text>
                  </View>
                )}
              </View>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>{v.registration_plate} · {formatVehicleType(v.vehicle_type)}</Text>
            </View>
          ))
        )}
        <TouchableOpacity className="rounded-full w-full py-[16px] items-center mt-2" style={{ backgroundColor: colors.primary }} onPress={() => router.push("/(main)/(rider)/add-vehicle")}>
          <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>+ Add Vehicle</Text>
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
