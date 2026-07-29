import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function RateRider() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a rating"); return; }
    if (!rideId) { setError("No ride to rate"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, feedback: feedback.trim() || undefined, role: "driver" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      router.replace("/(main)/(rider)/");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Rate rider failed", err);
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Rate Rider</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 items-center px-[24px] pt-[40px]">
        <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-3">
          <Text className="text-[28px] font-JakartaBold tracking-tight text-goPrimary">R</Text>
        </View>
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6">Rider</Text>
        <View className="flex-row gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}>
              <Text className="text-[36px]">{star <= rating ? "★" : "☆"}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark w-full mb-4"
          placeholder="Optional feedback"
          placeholderTextColor="#9CA3AF"
          multiline
          value={feedback}
          onChangeText={setFeedback}
        />
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Submit Rating</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
