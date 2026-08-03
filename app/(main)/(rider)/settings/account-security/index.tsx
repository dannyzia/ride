import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function DriverSettingsAccount() {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); setDeleting(false); return; }
      const res = await fetch(`${API_URL}/api/user/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: "user_initiated" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to delete account"); setDeleting(false); return; }
      await supabase.auth.signOut();
      router.replace("/(auth)/phone-entry");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Account delete failed", err);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Account & Security</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => router.push("/(main)/(rider)/settings/change-password")}
        >
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Security & Login Info</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Phone number & login method</Text>
        </TouchableOpacity>
        <View className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3">
          <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Two-factor authentication</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Not configured</Text>
        </View>
        <TouchableOpacity
          className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-3"
          onPress={() => setShowDeleteConfirm(true)}
        >
          <Text className="text-[15px] font-JakartaBold text-goDanger">Delete account</Text>
          <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Permanently remove your account and all data</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-[24px]">
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark rounded-[16px] p-[24px] w-full">
            <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Delete Account?</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-6">This action cannot be undone. All your data will be permanently removed.</Text>
            {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
            <TouchableOpacity
              className="bg-goDanger rounded-full w-full py-[16px] items-center mb-3"
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text className="text-[18px] font-JakartaBold text-goWhite">Yes, Delete</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              className="border border-goBorderLight dark:border-goBorderDark rounded-full w-full py-[16px] items-center"
              onPress={() => { setShowDeleteConfirm(false); setError(""); }}
              disabled={deleting}
            >
              <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}