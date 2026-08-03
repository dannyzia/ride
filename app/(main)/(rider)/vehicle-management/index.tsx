import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Vehicles fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  const formatVehicleType = (type: string) =>
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">My Vehicles</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
        ) : vehicles.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-8">No vehicles registered yet.</Text>
        ) : (
          vehicles.map((v) => (
            <View key={v.id} className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{v.vehicle_model}</Text>
                {v.is_active && (
                  <View className="bg-goAccentLight dark:bg-goPrimary/20 rounded-full px-[10px] py-[2px]">
                    <Text className="text-[12px] font-JakartaBold text-goPrimary">Active</Text>
                  </View>
                )}
              </View>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">{v.registration_plate} · {formatVehicleType(v.vehicle_type)}</Text>
            </View>
          ))
        )}
        <TouchableOpacity className="bg-goPrimary rounded-full w-full py-[16px] items-center mt-2" onPress={() => router.push("/(main)/(rider)/add-vehicle")}>
          <Text className="text-[18px] font-JakartaBold text-goWhite">+ Add Vehicle</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}