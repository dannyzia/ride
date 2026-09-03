import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function ChangePassword() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleChange = async () => {
    if (newPassword.length < 6) { setError("New password must be at least 6 characters"); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user?.phone) {
        setError("Cannot change password: no phone on account. Please use OTP login.");
        setLoading(false);
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: user.phone,
        password: currentPassword,
      });
      if (signInError) {
        setError("Current password is incorrect");
        setLoading(false);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) { setError(updateError.message); return; }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Password change failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <Text className="text-[22px] font-JakartaBold tracking-tight text-goPrimary mb-4">Password Updated</Text>
        <Text className="text-[15px] font-Jakarta text-center mb-8" style={{ color: textSecondary }}>
          Your password has been changed successfully.
        </Text>
        <TouchableOpacity className="bg-goPrimary rounded-full px-[24px] py-[12px]" onPress={() => router.back()}>
          <Text className="text-[16px] font-JakartaBold text-goWhite">Done</Text>
        </TouchableOpacity>
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

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Change Password</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="border rounded-[12px] p-[16px] mb-6" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-Jakarta leading-5" style={{ color: textSecondary }}>
            You set a password during registration. You can change it here. If you use phone OTP login exclusively, you don&apos;t need a password.
          </Text>
        </View>
        <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: textPrimary }}>Current Password</Text>
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder="Enter current password"
          placeholderTextColor={textSecondary}
          secureTextEntry
          value={currentPassword}
          onChangeText={setCurrentPassword}
        />
        <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: textPrimary }}>New Password</Text>
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder="Min 6 characters"
          placeholderTextColor={textSecondary}
          secureTextEntry
          value={newPassword}
          onChangeText={setNewPassword}
        />
        <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: textPrimary }}>Confirm New Password</Text>
        <TextInput
          className="border rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta mb-4"
          style={{ backgroundColor: surfaceBg, borderColor, color: textPrimary }}
          placeholder="Re-enter new password"
          placeholderTextColor={textSecondary}
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleChange}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Update Password</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
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
