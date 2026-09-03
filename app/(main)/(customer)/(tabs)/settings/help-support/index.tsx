import { View, Text, TouchableOpacity, ScrollView, Linking, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function SettingsHelpSupport() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const supportPhone = process.env.EXPO_PUBLIC_SUPPORT_PHONE || "+8801XXXXXXXXX";

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/settings")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.help_support')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('help_support.quick_help')}</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/faq")}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.primary }}><Ionicons name="help-circle" size={16} color={colors.white} /></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.faq')}</Text><Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('help_support.faq_desc')}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/contact-support")}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.primary }}><Ionicons name="chatbubble-ellipses" size={16} color={colors.white} /></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.contact_support')}</Text><Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('help_support.contact_desc')}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => Linking.openURL('tel:' + supportPhone)}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}><Ionicons name="call" size={16} color={colors.primary} /></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('help_support.call_support')}</Text><Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>+880 1XXX-XXXXXX</Text></View>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
          </TouchableOpacity>
        </View>
        <View className="mt-6">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('settings.safety')}</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/emergency-contacts")}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.danger }}><Ionicons name="warning" size={16} color={colors.white} /></View>
            <View className="flex-1"><Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{t('settings.emergency_contacts')}</Text><Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>{t('help_support.emergency_desc')}</Text></View>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
          </TouchableOpacity>
        </View>
        <View className="mt-6">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('help_support.legal')}</Text>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/privacy-policy")}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.primary }}><Ionicons name="document-text" size={16} color={colors.white} /></View>
            <Text className="flex-1 text-[14px] font-Jakarta" style={{ color: textPrimary }}>{t('legal.privacy_policy')}</Text>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity className="flex-row items-center p-[12px] border rounded-[8px] mb-2" style={{ backgroundColor: surfaceBg, borderColor }} onPress={() => router.push("/(main)/(customer)/(tabs)/settings/terms-of-service")}>
            <View className="w-8 h-8 rounded-full mr-3 items-center justify-center" style={{ backgroundColor: colors.primary }}><Ionicons name="clipboard" size={16} color={colors.white} /></View>
            <Text className="flex-1 text-[14px] font-Jakarta" style={{ color: textPrimary }}>{t('legal.terms_of_service')}</Text>
            <Ionicons name="chevron-forward" size={16} color={textSecondary} />
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
