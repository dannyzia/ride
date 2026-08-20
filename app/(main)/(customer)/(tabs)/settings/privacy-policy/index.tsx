import { View, Text, ScrollView, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function SettingsPrivacyPolicy() {
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
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }} onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Privacy Policy</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[14px] font-Jakarta mt-4 mb-4" style={{ color: textPrimary }}>Last updated: July 15, 2026</Text>
        <View className="gap-6">
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>1. Information We Collect</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>We collect information you provide directly to us, such as when you create an account, book a ride, or contact support. This includes your name, phone number, email, payment information, and location data.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>2. How We Use Your Information</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>We use your information to provide, maintain, and improve our services, process payments, send notifications, and communicate with you about your rides and account.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>3. Information Sharing</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>We may share your information with drivers to facilitate rides, with payment processors for transactions, and with authorities when required by law. We do not sell your personal data.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>4. Data Security</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>5. Your Rights</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>You have the right to access, correct, or delete your personal data. You can manage your data in Settings → Data & Analytics or contact us at privacy@goride.com.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>6. Contact Us</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>If you have questions about this Privacy Policy, contact us at privacy@goride.com or through the app&apos;s Contact Support feature.</Text></View>
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
