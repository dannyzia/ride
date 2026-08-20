import { View, Text, ScrollView, TouchableOpacity, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function SettingsTermsOfService() {
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Terms of Service</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <Text className="text-[14px] font-Jakarta mt-4 mb-4" style={{ color: textPrimary }}>Last updated: July 15, 2026</Text>
        <View className="gap-6">
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>1. Acceptance of Terms</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>By using GoRide, you agree to these Terms of Service. If you do not agree, please do not use our services.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>2. Eligibility</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>You must be at least 18 years old and legally capable of entering into contracts to use our services.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>3. User Accounts</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>You are responsible for maintaining the confidentiality of your account and for all activities under your account. Provide accurate information and update it as needed.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>4. Ride Services</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>GoRide connects riders with independent driver-partners. We do not employ drivers. Rides are subject to availability and local regulations.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>5. Payments</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Fares are calculated based on distance, time, and demand. Payment is processed through our payment partners. All amounts are in BDT.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>6. Prohibited Conduct</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>You may not use our services for illegal activities, harass drivers or other users, damage property, or interfere with our platform&apos;s operation.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>7. Limitation of Liability</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>GoRide is not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid for the relevant service.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>8. Changes to Terms</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>We may modify these terms at any time. Continued use after changes constitutes acceptance.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>9. Governing Law</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>These terms are governed by the laws of Bangladesh. Disputes will be resolved in the courts of Dhaka.</Text></View>
          <View><Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>10. Contact</Text><Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>Questions about these Terms? Contact us at legal@goride.com or through the app.</Text></View>
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
