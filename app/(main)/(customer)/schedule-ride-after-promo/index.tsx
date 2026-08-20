import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function ScheduleRideAfterPromo() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const options = [
    { name: "GoRide Economy", fare: "৳800" },
    { name: "GoRide Comfort", fare: "৳1200" },
    { name: "GoRide Premium", fare: "৳2000" },
  ];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Schedule Ride</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Promo Applied</Text>
          <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Promo applied to this schedule</Text>
        </View>
        <View className="mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Fare Options (with discount)</Text>
          {options.map((option, i) => (
            <View
              key={i}
              className="flex-row items-center px-[12px] py-[8px] mb-2 border rounded-[8px]"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <View className="w-8 h-8 rounded-full mr-3 items-center justify-center">
                <Ionicons name="car" size={16} color={textSecondary} />
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{option.name}</Text>
              </View>
              <Text className="text-[12px] font-JakartaBold" style={{ color: colors.primary }}>{option.fare}</Text>
            </View>
          ))}
        </View>
        <View className="mt-6">
          <TouchableOpacity
            className="rounded-full w-full py-[16px] items-center"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.replace("/(main)/(customer)/ride-scheduled")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Continue</Text>
          </TouchableOpacity>
        </View>
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
