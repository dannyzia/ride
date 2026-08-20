import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface CanceledRide {
  ride_id: string;
  vehicle_type: string;
  created_at: string;
  cancel_reason: string;
  origin_address: string;
}

export default function ActivityCanceled() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [rides, setRides] = useState<CanceledRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setError("Not authenticated"); setLoading(false); return; }
        const res = await fetch(`${API_URL}/api/ride/get-all`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error || "Failed to load"); return; }
        if (!cancelled) {
          const allRides = data.data || [];
          setRides(allRides.filter((r: { status: string }) => r.status === "cancelled"));
        }
      } catch (err) {
        if (!cancelled) setError((err instanceof Error ? err.message : String(err)) || "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return new Intl.DateTimeFormat("bn-BD", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        numberingSystem: "latn",
        timeZone: "Asia/Dhaka",
      }).format(d);
    } catch { return iso; }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Canceled Rides</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-center" style={{ color: colors.danger }}>{error}</Text>
        </View>
      ) : rides.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>No canceled rides</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {rides.map((r) => (
            <View
              key={r.ride_id}
              className="p-[16px] border rounded-[12px] mb-3"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <View className="flex-row justify-between items-start">
                <View className="flex-1">
                  <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>
                    {r.vehicle_type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
                  </Text>
                  <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                    {formatDate(r.created_at)} · {r.cancel_reason ?? "Canceled"}
                  </Text>
                  <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                    {r.origin_address ?? "—"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <TouchableOpacity
            className="rounded-full w-full py-[16px] items-center mt-4"
            style={{ backgroundColor: colors.primary }}
            onPress={() => router.replace("/(main)/(customer)/(tabs)/home")}
          >
            <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>Book new ride</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
