import { View, Text, TouchableOpacity, ScrollView, Linking, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/useRiderStore";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function DriverInfo() {
  const { t } = useTranslation();
  const { activeRide } = useRiderStore();
  const driver = activeRide?.driver;
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleCall = () => {
    if (driver?.phone) {
      Linking.openURL(`tel:${driver.phone}`);
    }
  };

  const handleChat = () => {
    if (activeRide?.id) {
      router.push(`/(main)/(customer)/chat/${activeRide.id}`);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }} onPress={() => router.back()}>{t('common.back')}</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('driver_info.title')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-6">
          <View
            className="w-20 h-20 rounded-full items-center justify-center mb-3"
            style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
          >
            <Text className="text-[28px] font-JakartaBold tracking-tight" style={{ color: colors.primary }}>{driver?.name?.charAt(0) ?? "D"}</Text>
          </View>
          <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>{driver?.name ?? t('driver_info.driver')}</Text>
          <View className="flex-row items-center mt-1">
            <Ionicons name="star" size={16} color={colors.amber} />
            <Text className="text-[14px] font-Jakarta ml-1" style={{ color: textSecondary }}>
              {driver?.rating ?? t('driver_info.na')} · {driver?.vehicle_type ?? ""}
            </Text>
          </View>
        </View>
        <View className="flex-row gap-4">
          <TouchableOpacity className="flex-1 rounded-full py-[14px] items-center" style={{ backgroundColor: colors.primary }} onPress={handleCall}>
            <Text className="text-[16px] font-JakartaBold text-goWhite">{t('driver_info.call')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 border rounded-full py-[14px] items-center"
            style={{ borderColor }}
            onPress={handleChat}
          >
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>{t('driver_info.chat')}</Text>
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
