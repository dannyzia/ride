import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function ScheduleRideAfterPromo() {
  const options = [
    { icon: "🚗", name: "GoRide Economy", fare: "৳800" },
    { icon: "🚗", name: "GoRide Comfort", fare: "৳1200" },
    { icon: "🚗", name: "GoRide Premium", fare: "৳2000" },
  ];

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Schedule Ride</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4 mb-4">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Promo Applied</Text>
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">WELCOME20</Text>
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">20% off scheduled rides</Text>
        </View>
        <View className="mb-4">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Fare Options (with discount)</Text>
          {options.map((option, i) => (
            <View key={i} className="flex-row items-center px-[12px] py-[8px] mb-2 bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[8px]">
              <View className="w-8 h-8 rounded-full mr-3 items-center justify-center">
                <Text className="text-[16px]">{option.icon}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{option.name}</Text>
              </View>
              <Text className="text-[12px] font-JakartaBold text-goPrimary">{option.fare}</Text>
            </View>
          ))}
        </View>
        <View className="mt-6">
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center"
            onPress={() => router.replace("/(main)/(customer)/ride-scheduled")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Continue</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}