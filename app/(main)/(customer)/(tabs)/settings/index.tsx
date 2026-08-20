import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ThemeToggle from "@/components/ThemeToggle";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface SettingsItem {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const items: SettingsItem[] = [
  { label: "Personal Info", route: "/(main)/(customer)/(tabs)/settings/personal-info", icon: "person-outline" },
  { label: "Notifications", route: "/(main)/(customer)/(tabs)/settings/notifications", icon: "notifications-outline" },
  { label: "App Appearance", route: "/(main)/(customer)/(tabs)/settings/app-appearance", icon: "color-palette-outline" },
  { label: "Language", route: "/(main)/(customer)/(tabs)/settings/app-language", icon: "language-outline" },
  { label: "Saved Addresses", route: "/(main)/(customer)/(tabs)/settings/saved-addresses", icon: "location" },
  { label: "Emergency Contacts", route: "/(main)/(customer)/(tabs)/settings/emergency-contacts", icon: "medkit-outline" },
  { label: "Linked Accounts", route: "/(main)/(customer)/(tabs)/settings/linked-accounts", icon: "link-outline" },
  { label: "Data & Analytics", route: "/(main)/(customer)/(tabs)/settings/data-analytics", icon: "stats-chart-outline" },
  { label: "Request My Data", route: "/(main)/(customer)/(tabs)/settings/request-data", icon: "download" },
  { label: "Delete My Data", route: "/(main)/(customer)/(tabs)/settings/delete-data", icon: "trash" },
  { label: "Delete Account", route: "/(main)/(customer)/(tabs)/settings/delete-account", icon: "warning-outline" },
  { label: "Terms of Service", route: "/(main)/(customer)/(tabs)/settings/terms-of-service", icon: "document-text" },
  { label: "Privacy Policy", route: "/(main)/(customer)/(tabs)/settings/privacy-policy", icon: "lock-closed-outline" },
  { label: "FAQ", route: "/(main)/(customer)/(tabs)/settings/faq", icon: "help-circle" },
  { label: "Contact Support", route: "/(main)/(customer)/(tabs)/settings/contact-support", icon: "chatbubble-ellipses" },
  { label: "Help & Support", route: "/(main)/(customer)/(tabs)/settings/help-support", icon: "information-circle-outline" },
  { label: "Top Up Wallet", route: "/(main)/(customer)/(tabs)/settings/top-up", icon: "card" },
  { label: "Ride Pass", route: "/(main)/(customer)/(tabs)/settings/ride-pass", icon: "ticket-outline" },
  { label: "Loyalty & Rewards", route: "/(main)/(customer)/(tabs)/settings/loyalty", icon: "star" },
  { label: "Lost Items", route: "/(main)/(customer)/(tabs)/settings/lost-items", icon: "search-outline" },
  { label: "Logout", route: "/(main)/(customer)/(tabs)/settings/logout-confirmation", icon: "log-out-outline" },
];

export default function RiderSettingsHub() {
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
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>Settings</Text>
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
            <Text className="flex-1 text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{it.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
