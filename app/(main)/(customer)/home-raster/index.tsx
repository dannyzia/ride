import { View, Text, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useCustomer } from "@/store";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function HomeRasterCar() {
  const { userLatitude, userLongitude } = useCustomer();
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
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
      <View className="flex-1 items-center justify-center">
        <Ionicons name="map" size={40} color={textSecondary} />
        <Text className="text-[18px] font-JakartaBold mt-2" style={{ color: textPrimary }}>
          Your location
        </Text>
        <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
          {userLatitude?.toFixed(4) ?? "—"}, {userLongitude?.toFixed(4) ?? "—"}
        </Text>
      </View>
      <View className="p-[24px]">
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.push("/(main)/(customer)/autocomplete")}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Where to?</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
