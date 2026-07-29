import { useState } from "react";
import { View, Text, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { logger } from "@/lib/logger";

const PRESET_AMOUNTS = ["200", "500", "1000", "2000"];

export default function TopUp() {
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Top Up</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">
          Enter Amount
        </Text>
        <View className="flex-row items-center bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] mb-4">
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mr-2">৳</Text>
          <TextInput
            className="flex-1 py-[14px] text-[18px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            placeholder="500"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {PRESET_AMOUNTS.map((preset) => (
            <TouchableOpacity
              key={preset}
              className={`px-[16px] py-[8px] rounded-full border ${
                amount === preset
                  ? "bg-goPrimary border-goPrimary"
                  : "bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-goBorderLight dark:border-goBorderDark"
              }`}
              onPress={() => setAmount(preset)}
            >
              <Text
                className={`text-[14px] font-JakartaBold ${
                  amount === preset ? "text-goWhite" : "text-goTextPrimaryLight dark:text-goTextPrimaryDark"
                }`}
              >
                ৳{preset}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          className="bg-goPrimary rounded-full w-full py-[16px] items-center"
          onPress={handleContinue}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}