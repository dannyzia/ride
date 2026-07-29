import { View, Text, TouchableOpacity, ScrollView, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function DriverSafety() {
  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Safety</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-3">Emergency contacts</Text>
        <TouchableOpacity
          className="flex-row items-center p-[14px] bg-goDanger/10 border border-goDanger/30 rounded-[12px] mb-2"
          onPress={() => Linking.openURL("tel:999")}
        >
          <Text className="text-[24px] mr-[12px]">🚨</Text>
          <View className="flex-1">
            <Text className="text-[15px] font-JakartaBold text-goDanger">National Emergency</Text>
            <Text className="text-[13px] font-Jakarta text-goDanger">999</Text>
          </View>
          <Text className="text-[18px] text-goDanger">📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="flex-row items-center p-[14px] bg-goDanger/10 border border-goDanger/30 rounded-[12px] mb-3"
          onPress={() => Linking.openURL("tel:16263")}
        >
          <Text className="text-[24px] mr-[12px]">📞</Text>
          <View className="flex-1">
            <Text className="text-[15px] font-JakartaBold text-goDanger">National Helpline</Text>
            <Text className="text-[13px] font-Jakarta text-goDanger">16263</Text>
          </View>
          <Text className="text-[18px] text-goDanger">📞</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => router.push("/(main)/(rider)/emergency-contacts")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Emergency contacts</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Manage your trusted contacts</Text>
            </View>
            <Text className="text-[18px] text-goTextSecondaryLight dark:text-goTextSecondaryDark">›</Text>
          </View>
        </TouchableOpacity>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-4 mb-3">Safety tips</Text>
        <View className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">1. Share your trip</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Share your live location with trusted contacts during each trip.</Text>
        </View>
        <View className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">2. Verify the rider</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Confirm the rider&apos;s name and destination before starting the trip.</Text>
        </View>
        <View className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-2">
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">3. Trust your instincts</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">If something feels wrong, cancel the ride and report it immediately.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}