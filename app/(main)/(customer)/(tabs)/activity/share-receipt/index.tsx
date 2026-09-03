import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useRiderStore } from "@/store/useRiderStore";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function ActivityShareReceipt() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { recentReceipts } = useRiderStore();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/activity")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('share_receipt.title')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {recentReceipts && recentReceipts.length > 0 ? (
          recentReceipts.map((receipt, index) => (
            <View key={index} className="mb-4 p-[12px] border rounded-[8px]" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row items-center mb-2">
                <View className="w-10 h-10 rounded-full items-center justify-center mr-3" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
                  <Ionicons name="receipt" size={20} color={colors.primary} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>
                    {receipt.vehicle_type ? receipt.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : t('share_receipt.ride')}
                  </Text>
                  <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{receipt.date} · {receipt.time}</Text>
                </View>
              </View>
              <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('share_receipt.from', { address: receipt.pickup_address })}</Text>
              <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('share_receipt.to', { address: receipt.destination_address })}</Text>
              <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('share_receipt.fare', { amount: (receipt.fare_bdt ?? 0) / 100 })}</Text>
              <View className="flex-row gap-3 mt-3">
                <TouchableOpacity className="flex-1 border rounded-[8px] px-[12px] py-[6px] items-center" style={{ backgroundColor: surfaceBg, borderColor }}>
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('share_receipt.share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 border rounded-[8px] px-[12px] py-[6px] items-center" style={{ backgroundColor: surfaceBg, borderColor }}>
                  <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('share_receipt.download')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View className="items-center py-[24px]">
            <Text className="text-[20px] font-JakartaBold tracking-tight mb-4" style={{ color: textSecondary }}>{t('share_receipt.no_receipts')}</Text>
            <Text className="text-[16px] font-Jakarta text-center" style={{ color: textSecondary }}>{t('share_receipt.empty_desc')}</Text>
          </View>
        )}
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
