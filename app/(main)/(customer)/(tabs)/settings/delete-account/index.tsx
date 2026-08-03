import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function SettingsDeleteAccount() {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (confirmText !== "DELETE") { setError("Please type DELETE to confirm"); return; }
    setIsDeleting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setIsDeleting(false); return; }
      const res = await fetch(API_URL + "/api/user/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      });
      if (res.ok) {
        await supabase.auth.signOut();
        router.replace("/(auth)/phone-entry");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to delete account");
      }
    } catch (err) {
      logger.error("Delete account failed", err);
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Delete Account</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mt-6 mb-6">
          <View className="w-24 h-24 rounded-full bg-goDanger/10 dark:bg-goDanger/10 items-center justify-center mb-4">
            <Text className="text-[40px]">⚠️</Text>
          </View>
          <Text className="text-[24px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Delete Your Account</Text>
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mb-4">
            This action is permanent and cannot be undone. All your ride history, payment methods, saved addresses, and promotions will be deleted.
          </Text>
        </View>
        <View className="mb-6 p-[16px] bg-goDanger/10 dark:bg-goDanger/10 border border-goDanger/30 dark:border-goDanger/30 rounded-[12px]">
          <Text className="text-[14px] font-JakartaBold text-goDanger dark:text-goDanger mb-2">What will be deleted:</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Ride history and receipts</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Saved payment methods</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Saved addresses</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Promo codes and wallet balance</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">• Referral history</Text>
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3 text-center">{error}</Text> : null}
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Type DELETE to confirm</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="DELETE"
            placeholderTextColor="#9CA3AF"
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
          />
        </View>
        <TouchableOpacity
          className={'bg-goDanger rounded-full w-full py-[16px] items-center ' + (isDeleting || confirmText !== "DELETE" ? "opacity-40" : "")}
          onPress={handleDelete}
          disabled={isDeleting || confirmText !== "DELETE"}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{isDeleting ? "Deleting..." : "Delete My Account"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}