import { useState, useEffect } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";

export default function RateDriver() {
  const { activeRide } = useRiderStore();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const driver = activeRide?.driver;
  const driverId = activeRide?.driver_id ?? activeRide?.id;

  useEffect(() => {
    if (!driverId) return;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/block`, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          const blocked = (data.blocked_drivers ?? []).some((b: any) => b.driver_id === driverId);
          setIsBlocked(blocked);
        }
      } catch { /* non-blocking */ }
    })();
  }, [driverId]);

  const handleSubmit = async () => {
    if (rating === 0) { setError("Please select a rating"); return; }
    if (!activeRide?.id) { setError("No active ride"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${activeRide?.id}/rate`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, feedback: feedback.trim() || undefined, role: "rider" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to submit"); return; }
      router.replace("/(main)/(customer)/ride-completed");
    } catch (err: any) { setError(err?.message || "Network error"); logger.error("Rate driver failed", err); }
    finally { setLoading(false); }
  };

  const toggleBlock = () => {
    if (isBlocked) {
      Alert.alert("Unblock Driver?", "You will be matched again.", [
        { text: "Cancel", style: "cancel" },
        { text: "Unblock", onPress: async () => {
          setBlocking(true);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/block?driver_id=${driverId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
            setIsBlocked(false);
          } catch { Alert.alert("Error", "Failed to unblock"); }
          finally { setBlocking(false); }
        }},
      ]);
    } else {
      Alert.alert("Block Driver?", "You won't be matched with this driver again.", [
        { text: "Cancel", style: "cancel" },
        { text: "Block", style: "destructive", onPress: async () => {
          setBlocking(true);
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/block`, {
              method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ driver_id: driverId, reason: "other" }),
            });
            if (res.ok) setIsBlocked(true);
            else { const d = await res.json(); Alert.alert("Error", d.error ?? "Failed"); }
          } catch { Alert.alert("Error", "Network error"); }
          finally { setBlocking(false); }
        }},
      ]);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-base font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Rate the Driver</Text>
        <View className="w-12" />
      </View>
      <View className="flex-1 items-center px-6 pt-10">
        <View className="w-20 h-20 rounded-full bg-goAccentLight items-center justify-center mb-3">
          <Text className="text-[28px] font-JakartaBold tracking-tight text-goPrimary">{driver?.name?.charAt(0) ?? "D"}</Text>
        </View>
        <Text className="text-xl font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6">{driver?.name ?? "Driver"}</Text>
        <View className="flex-row gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <TouchableOpacity key={star} onPress={() => setRating(star)}><Text className="text-[36px]">{star <= rating ? "★" : "☆"}</Text></TouchableOpacity>
          ))}
        </View>
        <TextInput className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-lg px-4 py-3.5 text-sm font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark w-full mb-4"
          placeholder="Optional feedback" placeholderTextColor="#9CA3AF" multiline value={feedback} onChangeText={setFeedback} />
        {error ? <Text className="text-sm font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity className={`rounded-full w-full py-4 items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator size={20} color="#FFF" /> : <Text className="text-lg font-JakartaBold text-goWhite">Submit Rating</Text>}
        </TouchableOpacity>
        <TouchableOpacity onPress={toggleBlock} disabled={blocking} className={`mt-4 py-3 px-6 rounded-full items-center ${isBlocked ? "bg-goAccentLight" : "bg-goDangerLight"}`}>
          <Text className={`text-sm font-JakartaBold ${isBlocked ? "text-goAccent" : "text-goDanger"}`}>
            {blocking ? "..." : isBlocked ? "✓ Driver Blocked (tap to unblock)" : "🚫 Block this driver"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
