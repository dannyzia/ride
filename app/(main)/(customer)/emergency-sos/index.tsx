import { View, Text, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";

export default function EmergencySOS() {
  const handleEmergencyCall = () => {
    Linking.openURL("tel:999");
  };

  const handleShareLocation = () => {
    Linking.openURL("sms:?body=I need help. My live location is being shared via the Ride app.");
  };

  const handleReportIssue = () => {
    router.push("/(main)/(customer)/(tabs)/settings/help-support");
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark items-center justify-center px-[24px]">
      <View className="items-center mb-8">
        <View className="w-24 h-24 rounded-full bg-goDanger items-center justify-center mb-4">
          <Text className="text-[40px] text-goWhite">🆘</Text>
        </View>
        <Text className="text-[24px] font-JakartaBold tracking-tight text-goDanger mb-2">
          Emergency SOS
        </Text>
        <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-6">
          Tap for immediate help
        </Text>
      </View>
      <View className="w-full gap-4">
        <TouchableOpacity
          className="bg-goDanger rounded-full w-full py-[16px] items-center"
          onPress={handleEmergencyCall}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">Call Emergency Services (999)</Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={handleShareLocation}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
            Share Live Location
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
          onPress={handleReportIssue}
        >
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
            Report Safety Issue
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
