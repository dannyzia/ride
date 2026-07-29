import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function ContactSupport() {
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!msg.trim()) { setError("Please describe your issue"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category: "general", subject: msg.trim().slice(0, 200), description: msg.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to send"); return; }
      setSent(true);
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Contact support failed", err);
    } finally {
      setLoading(false);
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
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {sent ? (
          <View className="flex-1 items-center justify-center">
            <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-4">
              <Text className="text-[40px]">✅</Text>
            </View>
            <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Message sent</Text>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">We&apos;ll get back to you soon</Text>
          </View>
        ) : (
          <>
            <TextInput
              className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
              placeholder="Describe your issue..."
              placeholderTextColor="#9CA3AF"
              value={msg}
              onChangeText={setMsg}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            {error ? (
              <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
            ) : null}
            <TouchableOpacity
              className={`rounded-full w-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
              onPress={handleSend}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text className="text-[18px] font-JakartaBold text-goWhite">Send</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}