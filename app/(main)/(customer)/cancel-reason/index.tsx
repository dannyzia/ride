import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";

const REASONS = ["Waiting too long", "Found another ride", "Driver asked to cancel", "Changed my mind", "Other"];

export default function CancelReason() {
  const params = useLocalSearchParams<{ rideId?: string }>();
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [feeBdt, setFeeBdt] = useState<number | null>(null);
  const { searchingRideId, activeRide } = useRiderStore();
  const rideId = params.rideId || searchingRideId || activeRide?.id;
  const rideCreatedAt = activeRide?.created_at
    ? new Date(activeRide.created_at).getTime()
    : Date.now();

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - rideCreatedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [rideCreatedAt]);

  useEffect(() => {
    if (!rideId) return;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/cancel-preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setFeeBdt((await res.json()).fee_bdt ?? 0);
      } catch { /* non-blocking */ }
    })();
  }, [rideId]);

  const confirmCancel = async () => {
    if (!rideId || !selected) { setError("Please select a reason"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/ride/${rideId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cancelled_by: "rider", reason: selected, note: note.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to cancel"); return; }
      router.replace("/(main)/(customer)/canceled");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Cancel ride failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[16px] font-Jakarta text-goPrimary" onPress={() => router.back()}>Back</Text>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Cancel Ride</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 8 }}>
        {/* Cancel countdown / fee preview */}
        <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-[10px] px-4 py-3 mb-2">
          <Text className="text-[13px] font-Jakarta text-goAmber text-center">
            {elapsed < 120
              ? `Free cancellation for ${Math.floor((120 - elapsed) / 60)}:${String((120 - elapsed) % 60).padStart(2, '0')}`
              : `Cancellation fee: ৳${((feeBdt ?? 0) / 100).toFixed(0)}`}
          </Text>
          <Text className="text-[11px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-0.5">
            {elapsed < 120 ? "No fee within grace period" : feeBdt && feeBdt > 0 ? "Fee will be deducted from your wallet" : "No fee applies"}
          </Text>
        </View>

        {REASONS.map((reason) => (
          <TouchableOpacity
            key={reason}
            className={`flex-row items-center p-[16px] rounded-[10px] border ${
              selected === reason
                ? "border-goPrimary bg-goAccentLight"
                : "border-goBorderLight dark:border-goBorderDark bg-goSurfaceLight dark:bg-goSurfaceElevatedDark"
            }`}
            onPress={() => setSelected(reason)}
          >
            <View className={`w-5 h-5 rounded-full border-2 mr-[12px] items-center justify-center ${
              selected === reason ? "border-goPrimary" : "border-goBorderLight dark:border-goBorderDark"
            }`}>
              {selected === reason && <View className="w-2.5 h-2.5 rounded-full bg-goPrimary" />}
            </View>
            <Text className="text-[16px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark">{reason}</Text>
          </TouchableOpacity>
        ))}
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mt-4"
          placeholder="Optional note"
          placeholderTextColor="#9CA3AF"
          value={note}
          onChangeText={setNote}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger text-center mt-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center mt-8 ${loading || !selected ? "bg-goBorderDark" : "bg-goDanger"}`}
          onPress={confirmCancel}
          disabled={loading || !selected}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Confirm Cancel</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
