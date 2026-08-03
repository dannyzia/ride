import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const CATEGORIES = ["Driver behaviour", "Route issue", "Fare dispute", "Safety concern", "Lost item", "Technical issue", "Other"];

export default function ReportIssue() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!category) { setError("Please select a category"); return; }
    if (!description.trim()) { setError("Please describe the issue"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ category, subject: `Issue: ${category}`, message: description, ride_id: rideId }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Failed"); return; }
      router.back();
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Report issue failed", err);
    } finally { setLoading(false); }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Report an Issue</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Category</Text>
        {CATEGORIES.map((c) => (
          <TouchableOpacity key={c} className={`p-[14px] mb-2 rounded-[12px] border ${category === c ? "border-goPrimary bg-goAccentLight" : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"}`} onPress={() => setCategory(c)}>
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{c}</Text>
          </TouchableOpacity>
        ))}
        {category ? (
          <>
            <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2 mt-4">Describe the issue</Text>
            <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark min-h-[100px]" multiline placeholder="Tell us what happened..." placeholderTextColor="#9CA3AF" value={description} onChangeText={setDescription} />
            {error ? <Text className="text-[14px] font-Jakarta text-goDanger mt-3">{error}</Text> : null}
            <TouchableOpacity className={`rounded-full w-full py-[16px] items-center mt-4 ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator size={20} color="#FFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Submit</Text>}
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
