import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useRiderStore } from "@/store/useRiderStore";

export default function ActivityShareReceipt() {
  const { recentReceipts } = useRiderStore();

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/activity")}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Share Receipt</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {recentReceipts && recentReceipts.length > 0 ? (
          recentReceipts.map((receipt, index) => (
            <View key={index} className="mb-4 p-[12px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
              <View className="flex-row items-center mb-2">
                <View className="w-10 h-10 rounded-full bg-goAccentLight dark:bg-goAccentLight items-center justify-center mr-3">
                  <Text className="text-[20px]">🧾</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                    {receipt.vehicle_type ? receipt.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "Ride"}
                  </Text>
                  <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{receipt.date} · {receipt.time}</Text>
                </View>
              </View>
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">From: {receipt.pickup_address}</Text>
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">To: {receipt.destination_address}</Text>
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Fare: ৳{(receipt.fare_bdt ?? 0) / 100}</Text>
              <View className="flex-row gap-3 mt-3">
                <TouchableOpacity className="flex-1 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[6px] items-center">
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Share</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[12px] py-[6px] items-center">
                  <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View className="items-center py-[24px]">
            <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-4">No recent receipts</Text>
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center">Your recent receipts will appear here</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}