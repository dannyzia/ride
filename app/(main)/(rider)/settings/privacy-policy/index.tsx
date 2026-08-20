import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function DriverPrivacyPolicy() {
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
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="text-base font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Privacy Policy</Text>
        <View className="w-12" />
      </View>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <Text className="text-sm font-Jakarta leading-6" style={{ color: textSecondary }}>
          We value your privacy. This policy explains how we collect, use, and protect your personal information.{"\n\n"}
          1. Information we collect: Name, phone number, vehicle information, location data, and payment details.{"\n\n"}
          2. How we use it: To provide ride-matching services, process payments, and improve our platform.{"\n\n"}
          3. Data sharing: We share your information with riders during a trip (name, vehicle, location). We do not sell your data.{"\n\n"}
          4. Data retention: We retain your data for as long as your account is active and for 90 days thereafter.{"\n\n"}
          5. Your rights: You may request a copy of your data or deletion of your account at any time.{"\n\n"}
          6. Security: We use encryption for data in transit and at rest. We regularly audit our security practices.{"\n\n"}
          7. Contact: For privacy inquiries, contact support@goride.com.{"\n\n"}
          Last updated: July 2026.
        </Text>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
