import { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function RiderNoShow() {
  const { t } = useTranslation();  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [loading, setLoading] = useState(false);
  // §7.20: wait timer anchored to the server-stamped wait_start_at
  // (POST /api/ride/{id}/wait-start stamps it; GET /api/ride/{id} returns it).
  const [waitStartedAt, setWaitStartedAt] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleNoShow = async () => {
    if (!rideId) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert("Error", "Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/ride/${rideId}/no-show`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        const fee = (data.fee_bdt ?? 0) / 100;
        Alert.alert(
          "Ride Cancelled",
          fee > 0 ? `A cancellation fee of ৳${fee.toFixed(0)} has been applied.` : "No cancellation fee was charged.",
          [{ text: "OK", onPress: () => router.replace("/(main)/(rider)/") }],
        );
      } else {
        Alert.alert("Error", data.error || data.message || "Failed");
      }
    } catch (err) {
      logger.error("[no-show] error", err);
      Alert.alert("Error", "Network error");
    } finally {
      setLoading(false);
    }
  };

  // Fetch the ride once to anchor the wait timer to the server timestamp.
  const fetchedRef = useRef(false);
  useEffect(() => {
    if (!rideId || fetchedRef.current) return;
    fetchedRef.current = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/ride/${rideId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const ride = data.ride ?? data;
        if (ride?.wait_start_at) setWaitStartedAt(ride.wait_start_at);
      } catch (err) {
        // Timer stays hidden — the no-show action itself is unaffected.
        logger.warn("[no-show] wait_start_at fetch failed", err);
      }
    })();
  }, [rideId]);

  // Count-up timer (1s tick) while wait_start_at is known.
  useEffect(() => {
    if (!waitStartedAt) return;
    const start = new Date(waitStartedAt).getTime();
    if (Number.isNaN(start)) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [waitStartedAt]);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Rider No-Show</Text>
        <View style={{ width: 32 }} />
      </View>
      <View className="flex-1 items-center justify-center px-[24px]">
        <View className="w-24 h-24 rounded-full items-center justify-center mb-6" style={{ backgroundColor: `${colors.danger}1A` }}>
          <Ionicons name="time" size={48} color={colors.danger} />
        </View>
        <Text className="text-[22px] font-JakartaBold tracking-tight mb-2" style={{ color: textPrimary }}>Rider did not appear</Text>
        {/* §7.20 wait timer — driver-visible elapsed wait since wait-start */}
        {elapsed !== null ? (
          <Text
            className="text-[40px] font-JakartaBold mb-1"
            style={{ color: textPrimary, fontVariant: ["tabular-nums"] }}
          >
            {formatElapsed(elapsed)}
          </Text>
        ) : null}
        <Text className="text-[15px] font-Jakarta text-center mb-8" style={{ color: textSecondary }}>
          {elapsed !== null
            ? "Waiting time is running. Tap below to cancel and charge a fee."
            : "Waiting time exceeded. Tap below to cancel and charge a fee."}
        </Text>
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mb-3"
          style={{ backgroundColor: loading ? colors.borderDark : colors.danger }}
          onPress={handleNoShow}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>Cancel & charge fee</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          className="border rounded-full w-full py-[16px] items-center"
          style={{ borderColor }}
          onPress={() => router.back()}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Wait more</Text>
        </TouchableOpacity>
        {/* §7.20: plain cancellation (with reason) as the alternative path */}
        <TouchableOpacity
          className="mt-4 py-[12px]"
          onPress={() => router.push(`/(main)/(rider)/cancellation-reasons?rideId=${rideId}`)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-[15px] font-Jakarta" style={{ color: colors.primary }}>Cancel ride instead</Text>
        </TouchableOpacity>
      </View>
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
