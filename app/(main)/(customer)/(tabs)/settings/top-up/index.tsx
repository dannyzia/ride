import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const PRESET_AMOUNTS = ["200", "500", "1000", "2000"];

export default function TopUp() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [amount, setAmount] = useState("500");

  const handleContinue = () => {
    const amt = parseInt(amount, 10);
    if (!amt || amt < 50) {
      logger.warn("Invalid top-up amount", { amount });
      return;
    }
    router.push(`/(main)/(customer)/(tabs)/settings/top-up-method?amount=${amt}`);
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Top Up</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <Text className="text-[15px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
          Enter Amount
        </Text>
        <View className="flex-row items-center border rounded-[10px] px-[16px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[18px] font-JakartaBold mr-2" style={{ color: textPrimary }}>৳</Text>
          <TextInput
            className="flex-1 py-[14px] text-[18px] font-Jakarta"
            style={{ color: textPrimary }}
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholder="500"
            placeholderTextColor={textSecondary}
          />
        </View>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {PRESET_AMOUNTS.map((preset) => (
            <TouchableOpacity
              key={preset}
              className="px-[16px] py-[8px] rounded-full border"
              style={amount === preset
                ? { backgroundColor: colors.primary, borderColor: colors.primary }
                : { backgroundColor: surfaceBg, borderColor }}
              onPress={() => setAmount(preset)}
            >
              <Text
                className="text-[14px] font-JakartaBold"
                style={{ color: amount === preset ? colors.white : textPrimary }}
              >
                ৳{preset}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: colors.primary }}
          onPress={handleContinue}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Continue</Text>
        </TouchableOpacity>
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
