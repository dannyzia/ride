import { View, Text, TouchableOpacity, ScrollView, Linking, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function DriverSafety() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Safety</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta mb-3" style={{ color: textSecondary }}>Emergency contacts</Text>
        <TouchableOpacity
          className="flex-row items-center p-[14px] border rounded-[12px] mb-2"
          style={{ backgroundColor: `${colors.danger}1A`, borderColor: `${colors.danger}4D` }}
          onPress={() => Linking.openURL("tel:999")}
        >
          <View className="mr-[12px]">
            <Ionicons name="warning" size={24} color={colors.danger} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-JakartaBold" style={{ color: colors.danger }}>National Emergency</Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: colors.danger }}>999</Text>
          </View>
          <Ionicons name="call" size={18} color={colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-row items-center p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: `${colors.danger}1A`, borderColor: `${colors.danger}4D` }}
          onPress={() => Linking.openURL("tel:16263")}
        >
          <View className="mr-[12px]">
            <Ionicons name="call" size={24} color={colors.danger} />
          </View>
          <View className="flex-1">
            <Text className="text-[15px] font-JakartaBold" style={{ color: colors.danger }}>National Helpline</Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: colors.danger }}>16263</Text>
          </View>
          <Ionicons name="call" size={18} color={colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/emergency-contacts")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Emergency contacts</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Manage your trusted contacts</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </View>
        </TouchableOpacity>
        <Text className="text-[14px] font-Jakarta mt-4 mb-3" style={{ color: textSecondary }}>Safety tips</Text>
        <View className="p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>1. Share your trip</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Share your live location with trusted contacts during each trip.</Text>
        </View>
        <View className="p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>2. Verify the rider</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Confirm the rider&apos;s name and destination before starting the trip.</Text>
        </View>
        <View className="p-[14px] border rounded-[12px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>3. Trust your instincts</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>If something feels wrong, cancel the ride and report it immediately.</Text>
        </View>
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
