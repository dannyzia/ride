import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

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
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Settings</Text>
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {items.map((it) => (
          <TouchableOpacity
            key={it.route}
            className="flex-row justify-between items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
            onPress={() => router.push(it.route)}
          >
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{it.label}</Text>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}