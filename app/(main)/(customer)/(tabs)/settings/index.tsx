import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ThemeToggle from "@/components/ThemeToggle";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface SettingsItem {
  labelKey: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const items: SettingsItem[] = [
  { labelKey: "settings.personal_info", route: "/(main)/(customer)/(tabs)/settings/personal-info", icon: "person-outline" },
  { labelKey: "settings.notifications", route: "/(main)/(customer)/(tabs)/settings/notifications", icon: "notifications-outline" },
  { labelKey: "settings.app_appearance", route: "/(main)/(customer)/(tabs)/settings/app-appearance", icon: "color-palette-outline" },
  { labelKey: "settings.language", route: "/(main)/(customer)/(tabs)/settings/app-language", icon: "language-outline" },
  { labelKey: "settings.saved_addresses", route: "/(main)/(customer)/(tabs)/settings/saved-addresses", icon: "location" },
  { labelKey: "settings.emergency_contacts", route: "/(main)/(customer)/(tabs)/settings/emergency-contacts", icon: "medkit-outline" },
  { labelKey: "settings.linked_accounts", route: "/(main)/(customer)/(tabs)/settings/linked-accounts", icon: "link-outline" },
  { labelKey: "settings.data_analytics", route: "/(main)/(customer)/(tabs)/settings/data-analytics", icon: "stats-chart-outline" },
  { labelKey: "settings.request_data", route: "/(main)/(customer)/(tabs)/settings/request-data", icon: "download" },
  { labelKey: "settings.delete_data", route: "/(main)/(customer)/(tabs)/settings/delete-data", icon: "trash" },
  { labelKey: "settings.delete_account", route: "/(main)/(customer)/(tabs)/settings/delete-account", icon: "warning-outline" },
  { labelKey: "settings.terms", route: "/(main)/(customer)/(tabs)/settings/terms-of-service", icon: "document-text" },
  { labelKey: "settings.privacy", route: "/(main)/(customer)/(tabs)/settings/privacy-policy", icon: "lock-closed-outline" },
  { labelKey: "settings.faq", route: "/(main)/(customer)/(tabs)/settings/faq", icon: "help-circle" },
  { labelKey: "settings.contact_support", route: "/(main)/(customer)/(tabs)/settings/contact-support", icon: "chatbubble-ellipses" },
  { labelKey: "settings.help_support", route: "/(main)/(customer)/(tabs)/settings/help-support", icon: "information-circle-outline" },
  { labelKey: "settings.top_up_wallet", route: "/(main)/(customer)/(tabs)/settings/top-up", icon: "card" },
  { labelKey: "settings.ride_pass", route: "/(main)/(customer)/(tabs)/settings/ride-pass", icon: "ticket-outline" },
  { labelKey: "settings.loyalty", route: "/(main)/(customer)/(tabs)/settings/loyalty", icon: "star" },
  { labelKey: "settings.lost_items", route: "/(main)/(customer)/(tabs)/settings/lost-items", icon: "search-outline" },
  { labelKey: "settings.logout", route: "/(main)/(customer)/(tabs)/settings/logout-confirmation", icon: "log-out-outline" },
];

export default function RiderSettingsHub() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>{t('settings.title')}</Text>
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <View className="mb-4">
          <ThemeToggle />
        </View>
        {items.map((it) => (
          <TouchableOpacity
            key={it.route}
            className="flex-row items-center p-[14px] border rounded-[12px] mb-3"
            style={{ backgroundColor: surfaceBg, borderColor }}
            onPress={() => router.push(it.route)}
          >
            <Ionicons name={it.icon} size={20} color={colors.primary} style={{ marginRight: 12 }} />
            <Text className="flex-1 text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{t(it.labelKey)}</Text>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
