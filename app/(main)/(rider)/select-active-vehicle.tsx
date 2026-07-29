import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useDriverStore } from "@/store/useDriverStore";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import { supabase } from "@/lib/supabase";

export default function SelectActiveVehicle() {
  const { driver, setDriver } = useDriverStore();
  const [selected, setSelected] = useState(driver?.vehicle_type || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setSaving(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vehicle_type: selected }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to save vehicle type");
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Select Vehicle</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 10 }}>
        {VEHICLE_TYPES.map((v) => (
          <TouchableOpacity
            key={v.key}
            className={`flex-row items-center p-[16px] rounded-[10px] border ${
              selected === v.key
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setSelected(v.key)}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-[12px] ${selected === v.key ? "border-goPrimary bg-goPrimary" : "border-goBorderLight dark:border-goBorderDark"}`} />
            <View className="flex-1">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{v.display_en}</Text>
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{v.seats} seats{v.has_ac === true ? " · AC" : v.has_ac === false ? " · No AC" : ""}</Text>
            </View>
          </TouchableOpacity>
        ))}
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger text-center">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center mt-4 ${!selected || saving ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={confirm}
          disabled={!selected || saving}
        >
          {saving ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Confirm & Go Online</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
