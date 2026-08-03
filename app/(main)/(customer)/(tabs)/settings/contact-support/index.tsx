import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function SettingsContactSupport() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) return;
    setIsSubmitting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: "general",
          subject: subject.trim(),
          description: message.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to send"); return; }
      setSent(true);
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("ContactSupport submit failed", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Contact Support</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {sent ? (
          <View className="flex-1 items-center justify-center py-20">
            <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-4">
              <Text className="text-[40px]">✅</Text>
            </View>
            <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Message sent</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">We&apos;ll get back to you soon</Text>
          </View>
        ) : (
          <>
            <View className="mt-4 mb-6">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Subject</Text>
              <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark" placeholder="What is this about?" placeholderTextColor="#9CA3AF" value={subject} onChangeText={setSubject} />
            </View>
            <View className="mb-6">
              <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-2">Message</Text>
              <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark" placeholder="Describe your issue..." placeholderTextColor="#9CA3AF" value={message} onChangeText={setMessage} multiline numberOfLines={8} textAlignVertical="top" />
            </View>
            {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
            <TouchableOpacity
              className={'bg-goPrimary rounded-full w-full py-[16px] items-center ' + (isSubmitting || !subject.trim() || !message.trim() ? 'opacity-40' : '')}
              onPress={handleSubmit}
              disabled={isSubmitting || !subject.trim() || !message.trim()}
            >
              {isSubmitting ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text className="text-[18px] font-JakartaBold text-goWhite">Send Message</Text>
              )}
            </TouchableOpacity>
            <View className="mt-6 items-center">
              <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Or call us at {process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "+880 1XXX-XXXXXX"}
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}