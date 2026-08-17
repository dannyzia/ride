import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import ThemeToggle from "@/components/ThemeToggle";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface SettingsItem {
  label: string;
  route: string;
}

const items: SettingsItem[] = [
  { label: "Notifications", route: "/(main)/(rider)/settings/notifications" },
  { label: "Auto-Accept", route: "/(main)/(rider)/settings/auto-accept" },
  { label: "Account & Security", route: "/(main)/(rider)/settings/account-security" },
  { label: "App Appearance", route: "/(main)/(rider)/settings/appearance" },
  { label: "Lost Items", route: "/(main)/(rider)/settings/lost-items" },
  { label: "Language", route: "/(main)/(rider)/settings/language" },
  { label: "Support", route: "/(main)/(rider)/support" },
  { label: "Safety", route: "/(main)/(rider)/safety" },
  { label: "Referral", route: "/(main)/(rider)/referral" },
  { label: "Terms of Service", route: "/(main)/(rider)/settings/terms-of-service" },
  { label: "Privacy Policy", route: "/(main)/(rider)/settings/privacy-policy" },
];

export default function DriverSettings() {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
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
            className="flex-row justify-between items-center p-[14px] border rounded-[12px] mb-3"
            style={{ backgroundColor: surfaceBg, borderColor }}
            onPress={() => router.push(it.route)}
          >
            <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{it.label}</Text>
            <Text className="text-[18px]" style={{ color: textSecondary }}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
