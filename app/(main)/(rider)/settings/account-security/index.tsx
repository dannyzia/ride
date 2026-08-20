import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function DriverSettingsAccount() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Account delete failed", err);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Account & Security</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/settings/change-password")}
        >
          <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Security & Login Info</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Phone number & login method</Text>
        </TouchableOpacity>
        <View className="p-[14px] border rounded-[12px] mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>Two-factor authentication</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Not configured</Text>
        </View>
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => setShowDeleteConfirm(true)}
        >
          <Text className="text-[15px] font-JakartaBold text-goDanger">Delete account</Text>
          <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>Permanently remove your account and all data</Text>
        </TouchableOpacity>
      </ScrollView>
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View className="flex-1 bg-black/50 items-center justify-center px-[24px]">
          <View className="rounded-[16px] p-[24px] w-full" style={{ backgroundColor: surfaceBg }}>
            <Text className="text-[18px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Delete Account?</Text>
            <Text className="text-[14px] font-Jakarta mb-6" style={{ color: textSecondary }}>This action cannot be undone. All your data will be permanently removed.</Text>
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
              className="border rounded-full w-full py-[16px] items-center"
              style={{ borderColor }}
              onPress={() => { setShowDeleteConfirm(false); setError(""); }}
              disabled={deleting}
            >
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
