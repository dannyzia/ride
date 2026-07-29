import { View, Text, ActivityIndicator, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function FindingDriver() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center">
        <View className="w-24 h-24 rounded-full bg-goAccentLight dark:bg-goAccentLight items-center justify-center mb-4">
          <Text className="text-[40px]">🔍</Text>
        </View>
        <ActivityIndicator size="large" color="#0CC25F" className="mb-4" />
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Finding a nearby driver...</Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-6">
          This usually takes just a few seconds.
        </Text>
        <TouchableOpacity
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-full shadow-go-sm px-[24px] py-[10px]"
          onPress={() => router.replace("/(main)/(customer)/no-drivers-available")}
        >
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel Request</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}