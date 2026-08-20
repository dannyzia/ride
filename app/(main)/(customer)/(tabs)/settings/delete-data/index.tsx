import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

export default function SettingsDeleteData() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

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
      const res = await fetch(API_URL + "/api/user/delete-data", {
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
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Delete My Data</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <View className="items-center mt-6 mb-6">
          <View
            className="w-24 h-24 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.danger + "1A" }}
          >
            <Ionicons name="trash" size={40} color={colors.danger} />
          </View>
          <Text className="text-[24px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>Delete Your Data</Text>
          <Text className="text-[16px] font-Jakarta text-center mb-4" style={{ color: textSecondary }}>
            Permanently delete all your personal data from our systems. This cannot be undone.
          </Text>
        </View>
        <View className="mb-6 p-[16px] border rounded-[12px]" style={{ backgroundColor: colors.danger + "1A", borderColor: colors.danger + "4D" }}>
          <Text className="text-[14px] font-JakartaBold mb-2" style={{ color: colors.danger }}>This will delete:</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>• All ride history and receipts</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>• Payment methods and transaction history</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>• Saved addresses and preferences</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>• Wallet balance and promo codes</Text>
          <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>• Device and login history</Text>
        </View>
        {error ? <Text className="text-[14px] font-Jakarta mb-3 text-center" style={{ color: colors.danger }}>{error}</Text> : null}
        <View className="mb-6">
          <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>Type DELETE MY DATA to confirm</Text>
          <TextInput
            className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
            placeholder="DELETE MY DATA"
            placeholderTextColor={textSecondary}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
          />
        </View>
        <TouchableOpacity
          className={'rounded-full w-full py-[16px] items-center ' + (isDeleting || confirmText !== "DELETE MY DATA" ? "opacity-40" : "")}
          style={{ backgroundColor: colors.danger }}
          onPress={handleDelete}
          disabled={isDeleting || confirmText !== "DELETE MY DATA"}
        >
          <Text className="text-[18px] font-JakartaBold text-goWhite">{isDeleting ? "Deleting..." : "Delete My Data"}</Text>
        </TouchableOpacity>
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
