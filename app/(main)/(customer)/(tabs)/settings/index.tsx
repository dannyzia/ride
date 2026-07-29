import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

interface SettingsItem {
  label: string;
  route: string;
  icon: string;
}

const items: SettingsItem[] = [
  { label: "Personal Info", route: "/(main)/(customer)/(tabs)/settings/personal-info", icon: "👤" },
  { label: "Notifications", route: "/(main)/(customer)/(tabs)/settings/notifications", icon: "🔔" },
  { label: "App Appearance", route: "/(main)/(customer)/(tabs)/settings/app-appearance", icon: "🎨" },
  { label: "Language", route: "/(main)/(customer)/(tabs)/settings/app-language", icon: "🌐" },
  { label: "Saved Addresses", route: "/(main)/(customer)/(tabs)/settings/saved-addresses", icon: "📍" },
  { label: "Emergency Contacts", route: "/(main)/(customer)/(tabs)/settings/emergency-contacts", icon: "🆘" },
  { label: "Linked Accounts", route: "/(main)/(customer)/(tabs)/settings/linked-accounts", icon: "🔗" },
  { label: "Data & Analytics", route: "/(main)/(customer)/(tabs)/settings/data-analytics", icon: "📊" },
  { label: "Request My Data", route: "/(main)/(customer)/(tabs)/settings/request-data", icon: "📥" },
  { label: "Delete My Data", route: "/(main)/(customer)/(tabs)/settings/delete-data", icon: "🗑️" },
  { label: "Delete Account", route: "/(main)/(customer)/(tabs)/settings/delete-account", icon: "⚠️" },
  { label: "Terms of Service", route: "/(main)/(customer)/(tabs)/settings/terms-of-service", icon: "📄" },
  { label: "Privacy Policy", route: "/(main)/(customer)/(tabs)/settings/privacy-policy", icon: "🔒" },
  { label: "FAQ", route: "/(main)/(customer)/(tabs)/settings/faq", icon: "❓" },
  { label: "Contact Support", route: "/(main)/(customer)/(tabs)/settings/contact-support", icon: "💬" },
  { label: "Help & Support", route: "/(main)/(customer)/(tabs)/settings/help-support", icon: "ℹ️" },
  { label: "Top Up Wallet", route: "/(main)/(customer)/(tabs)/settings/top-up", icon: "💳" },
  { label: "Ride Pass", route: "/(main)/(customer)/(tabs)/settings/ride-pass", icon: "🎟️" },
  { label: "Loyalty & Rewards", route: "/(main)/(customer)/(tabs)/settings/loyalty", icon: "⭐" },
  { label: "Lost Items", route: "/(main)/(customer)/(tabs)/settings/lost-items", icon: "🔍" },
  { label: "Logout", route: "/(main)/(customer)/(tabs)/settings/logout-confirmation", icon: "🚪" },
];

export default function RiderSettingsHub() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Settings</Text>
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {items.map((it) => (
          <TouchableOpacity
            key={it.route}
            className="flex-row items-center p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
            onPress={() => router.push(it.route)}
          >
            <Text className="text-[20px] mr-3">{it.icon}</Text>
            <Text className="flex-1 text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{it.label}</Text>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
