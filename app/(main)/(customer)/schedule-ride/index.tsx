import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function ScheduleRide() {
  const isDark = useIsDark();
  const [date, _setDate] = useState(new Date());
  const [time, _setTime] = useState(new Date());

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleSchedule = () => {
    router.replace("/(main)/(customer)/ride-scheduled");
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Schedule Ride</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Pickup & Destination</Text>
          <Text className="text-[14px] font-Jakarta mb-1" style={{ color: textSecondary }}>From: Current Location</Text>
          <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>To: Destination Selected Earlier</Text>
        </View>
        <View className="mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Date & Time</Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-2"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder="Select date"
            placeholderTextColor="#9CA3AF"
            value={date.toLocaleDateString()}
            editable={false}
          />
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder="Select time"
            placeholderTextColor="#9CA3AF"
            value={time.toLocaleTimeString()}
            editable={false}
          />
        </View>
        <View className="mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Vehicle Options</Text>
          <Text className="text-[14px] font-Jakarta mb-1" style={{ color: textSecondary }}>GoRide Economy</Text>
          <Text className="text-[14px] font-Jakarta mb-1" style={{ color: textSecondary }}>GoRide Comfort</Text>
          <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>GoRide Premium</Text>
        </View>
        <View className="mt-6">
          <TouchableOpacity
            className="rounded-full w-full py-[16px] items-center"
            style={{ backgroundColor: colors.primary }}
            onPress={handleSchedule}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Schedule Ride</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
