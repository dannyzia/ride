import { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function SettingsDeleteData() {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (confirmText !== "DELETE MY DATA") { setError("Please type DELETE MY DATA to confirm"); return; }
    setIsDeleting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setIsDeleting(false); return; }
      const res = await fetch(process.env.EXPO_PUBLIC_SERVER_URL + "/api/user/delete-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      if (res.ok) {
        Alert.alert("Success", "Your data has been deleted");
        router.back();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete data");
      }
    } catch (err) {
      logger.error("Delete data failed", err);
      setError("An error occurred");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Delete My Data</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mt-6 mb-6">
          <View className="w-24 h-24 rounded-full bg-goDanger/10 dark:bg-goDanger/10 items-center justify-center mb-4">
            <Text className="text-[40px]">🗑️</Text>
          </View>
          <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Delete Your Data</Text>
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-4">
            Permanently delete all your personal data from our systems. This cannot be undone.
          </Text>
        </View>
        <View className="mb-6 p-[16px] bg-goDanger/10 dark:bg-goDanger/10 border border-goDanger/30 dark:border-goDanger/30 rounded-[12px]">
          <Text className="text-[14px] font-JakartaBold text-goDanger dark:text-goDanger mb-2">This will delete:</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• All ride history and receipts</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Payment methods and transaction history</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Saved addresses and preferences</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Wallet balance and promo codes</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Device and login history</Text>
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3 text-center">{error}</Text> : null}
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Type DELETE MY DATA to confirm</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="DELETE MY DATA"
            placeholderTextColor="#9CA3AF"
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
          />
        </View>
        <TouchableOpacity
          className={'bg-goDanger rounded-full w-full py-[16px] items-center ' + (isDeleting || confirmText !== "DELETE MY DATA" ? "opacity-40" : "")}
          onPress={handleDelete}
          disabled={isDeleting || confirmText !== "DELETE MY DATA"}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{isDeleting ? "Deleting..." : "Delete My Data"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}