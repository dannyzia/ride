import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Reason {
  label: string;
  icon: string;
  category: string;
}

const reasons: Reason[] = [
  { label: "App bug or crash", icon: "🐛", category: "app_bug" },
  { label: "Payment problem", icon: "💳", category: "payment" },
  { label: "Rider issue", icon: "👤", category: "rider" },
  { label: "Safety concern", icon: "🛡️", category: "safety" },
  { label: "Map or navigation", icon: "🗺️", category: "map" },
  { label: "Other", icon: "📋", category: "other" },
];

export default function ReportIssue() {
  const [selected, setSelected] = useState<Reason | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category: selected.category,
          description: description.trim() || selected.label,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      router.replace("/(main)/(rider)/home");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("ReportIssue submit failed", err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Report Issue</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-3">Select issue type</Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {reasons.map((r) => (
            <TouchableOpacity
              key={r.category}
              className={`px-[16px] py-[10px] rounded-[8px] border ${
                selected?.category === r.category
                  ? "border-goPrimary bg-goAccentLight"
                  : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
              }`}
              onPress={() => setSelected(r)}
            >
              <Text className="text-[14px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{r.icon} {r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Description (optional)</Text>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
          placeholder="Tell us more about the issue..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${submitting || !selected ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSubmit}
          disabled={submitting || !selected}
        >
          {submitting ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Submit Report</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
