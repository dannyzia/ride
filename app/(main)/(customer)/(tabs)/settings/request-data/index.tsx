import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function SettingsRequestData() {
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState("");

  const handleRequest = async () => {
    setIsRequesting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setIsRequesting(false); return; }
      const res = await fetch(API_URL + "/api/user/request-data", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      if (res.ok) {
        Alert.alert("Requested", "Your data export has been requested. You will receive an email when it is ready.");
        router.back();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to request data");
      }
    } catch (err) {
      logger.error("Request data failed", err);
      setError("An error occurred");
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Request My Data</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mt-6 mb-6">
          <View className="w-24 h-24 rounded-full bg-goAccent/10 dark:bg-goAccent/10 items-center justify-center mb-4">
            <Text className="text-[40px]">📥</Text>
          </View>
          <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Request Your Data</Text>
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-4">
            Get a copy of all the data we have about you, including ride history, payments, and profile information.
          </Text>
        </View>
        <View className="mb-6 p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
          <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">What you will receive:</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Profile information</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Ride history (pickup, destination, fare, date)</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Payment history</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Saved addresses</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Device and login history</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Promo usage</Text>
        </View>
        <View className="mb-4 p-[16px] bg-goAccent/10 dark:bg-goAccent/10 border border-goBlue/30 dark:border-goBlue/30 rounded-[12px]">
          <Text className="text-[14px] font-JakartaBold text-goBlue dark:text-goBlue mb-2">Processing Time</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">We will prepare your data within 30 days and send a download link to your registered email.</Text>
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3 text-center">{error}</Text> : null}
        <TouchableOpacity
          className={'bg-goPrimary rounded-full w-full py-[16px] items-center ' + (isRequesting ? "opacity-40" : "")}
          onPress={handleRequest}
          disabled={isRequesting}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{isRequesting ? "Requesting..." : "Request Data Export"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}