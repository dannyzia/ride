import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";

const ISSUE_CATEGORIES = [
  "Rider misconduct",
  "Wrong pickup location",
  "Safety concern",
  "Payment issue",
  "Vehicle issue",
  "Other",
];

export default function TripIssue() {
  const [selected, setSelected] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { activeOffer } = useDriverFlowStore();
  const activeRideId = activeOffer?.ride_id;

  const handleSubmit = async () => {
    if (!selected) { setError("Please select a category"); return; }
    if (!activeRideId) { setError("No active ride"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/support/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ride_id: activeRideId,
          category: selected,
          description: description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      router.replace("/(main)/(rider)/");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Trip issue report failed", err);
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Report Issue</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Issue category</Text>
        {ISSUE_CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            className={`flex-row items-center p-[14px] mb-2 rounded-[12px] border ${
              selected === cat
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setSelected(cat)}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-[12px] ${selected === cat ? "border-goPrimary bg-goPrimary" : "border-goBorderLight dark:border-goBorderDark"}`} />
            <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{cat}</Text>
          </TouchableOpacity>
        ))}
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-4 mb-2">Description (optional)</Text>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
          placeholder="Describe what happened..."
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          value={description}
          onChangeText={setDescription}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Submit Report</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}