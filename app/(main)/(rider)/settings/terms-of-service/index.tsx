import { View, Text, TouchableOpacity, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function DriverTerms() {
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
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Terms of Service</Text>
        <View className="w-12" />
      </View>
      <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <Text className="text-sm font-Jakarta leading-6" style={{ color: textSecondary }}>
          By using the Ride platform, you agree to the following terms and conditions.{"\n\n"}
          1. You must be at least 18 years old and possess a valid driver&apos;s license.{"\n\n"}
          2. You are responsible for maintaining the confidentiality of your account credentials.{"\n\n"}
          3. All earnings are subject to applicable taxes. You are responsible for reporting your income.{"\n\n"}
          4. Ride reserves the right to suspend accounts that violate our community guidelines.{"\n\n"}
          5. We process payments through our third-party payment partner (PortPos). Transaction fees may apply.{"\n\n"}
          6. You agree not to engage in fraudulent activities, including fake rides or payment manipulation.{"\n\n"}
          7. Ride may update these terms at any time. Continued use constitutes acceptance of changes.{"\n\n"}
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
