import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ThemeToggle from "@/components/ThemeToggle";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface SettingsItem {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  section: string;
}

const SETTINGS: SettingsItem[] = [
  { label: "Packages", route: "/(main)/(rider)/packages", icon: "cube-outline", section: "Subscription" },
  { label: "Minimum Rate", route: "/(main)/(rider)/min-rate", icon: "speedometer-outline", section: "Subscription" },
  { label: "Payout Method", route: "/(main)/(rider)/payout-method", icon: "card-outline", section: "Subscription" },
  { label: "Notifications", route: "/(main)/(rider)/settings/notifications", icon: "notifications-outline", section: "Preferences" },
  { label: "Auto-Accept", route: "/(main)/(rider)/settings/auto-accept", icon: "checkmark-circle-outline", section: "Preferences" },
  { label: "App Appearance", route: "/(main)/(rider)/settings/appearance", icon: "color-palette-outline", section: "Preferences" },
  { label: "Language", route: "/(main)/(rider)/settings/language", icon: "globe-outline", section: "Preferences" },
  { label: "Account & Security", route: "/(main)/(rider)/settings/account-security", icon: "lock-closed-outline", section: "Account" },
  { label: "Lost Items", route: "/(main)/(rider)/settings/lost-items", icon: "search-outline", section: "Support" },
  { label: "Support", route: "/(main)/(rider)/support", icon: "help-circle-outline", section: "Support" },
  { label: "Safety", route: "/(main)/(rider)/safety", icon: "shield-outline", section: "Support" },
  { label: "Referral", route: "/(main)/(rider)/referral", icon: "gift-outline", section: "Support" },
  { label: "Terms of Service", route: "/(main)/(rider)/settings/terms-of-service", icon: "document-outline", section: "Legal" },
  { label: "Privacy Policy", route: "/(main)/(rider)/settings/privacy-policy", icon: "document-text-outline", section: "Legal" },
];

const SECTION_ORDER = ["Subscription", "Preferences", "Account", "Support", "Legal"];

export default function DriverSettings() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const grouped = SECTION_ORDER.reduce<Record<string, SettingsItem[]>>(
    (acc, section) => {
      acc[section] = SETTINGS.filter((s) => s.section === section);
      return acc;
    },
    {},
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      {/* Header with back button */}
      <View
        className="flex-row items-center px-[16px] py-[14px] border-b"
        style={{ borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>
          Settings
        </Text>
      </View>

      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {/* Theme toggle at top */}
        <View className="mb-4">
          <ThemeToggle />
        </View>

        {/* Grouped settings */}
        {SECTION_ORDER.map((section) => {
          const items = grouped[section];
          if (!items?.length) return null;
          return (
            <View key={section} className="mb-4">
              <Text
                className="text-[11px] font-JakartaSemiBold uppercase mb-2 px-1"
                style={{ color: textSecondary, letterSpacing: 0.5 }}
              >
                {section}
              </Text>
              <View
                className="rounded-[12px] overflow-hidden"
                style={{ borderWidth: 1, borderColor }}
              >
                {items.map((item, i) => (
                  <TouchableOpacity
                    key={item.route}
                    className="flex-row items-center gap-3 px-[14px] py-[13px]"
                    style={{
                      backgroundColor: surfaceBg,
                      borderBottomWidth: i < items.length - 1 ? 1 : 0,
                      borderColor,
                    }}
                    onPress={() => router.push(item.route as never)}
                  >
                    <Ionicons name={item.icon} size={20} color={colors.primary} />
                    <Text
                      className="text-[15px] font-Jakarta flex-1"
                      style={{ color: textPrimary }}
                    >
                      {item.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
