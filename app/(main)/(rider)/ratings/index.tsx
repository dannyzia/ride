import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface Review {
  id: string;
  rider_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

interface RatingsData {
  average_rating: number;
  total_reviews: number;
  reviews: Review[];
}

export default function Ratings() {
  const [data, setData] = useState<RatingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchRatings = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/ratings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load ratings"); return; }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Ratings fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRatings(); }, [fetchRatings]);

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); }
    catch { return iso; }
  };

  const renderStars = (count: number) => {
    const full = Math.floor(count);
    const half = count - full >= 0.5;
    const empty = 5 - full - (half ? 1 : 0);
    return (
      <View className="flex-row items-center">
        {Array.from({ length: full }).map((_, i) => (
          <Ionicons key={`f${i}`} name="star" size={16} color={colors.amber} />
        ))}
        {half ? <Ionicons name="star-half" size={16} color={colors.amber} /> : null}
        {Array.from({ length: empty }).map((_, i) => (
          <Ionicons key={`e${i}`} name="star-outline" size={16} color={colors.amber} />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()} className="mr-[12px] p-[4px]">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Ratings & Reviews</Text>
        <View style={{ width: 32 }} />
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" className="mt-3" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta mt-1" style={{ color: colors.danger }}>{error}</Text>
        ) : data ? (
          <View className="flex-row items-center gap-3 mt-1">
            <View className="flex-row items-center">
              <Ionicons name="star" size={32} color={colors.amber} />
              <Text className="text-[32px] font-JakartaBold tracking-tight" style={{ color: colors.primary }}>{data.average_rating.toFixed(1)}</Text>
            </View>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
              {data.total_reviews} review{data.total_reviews !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>{error}</Text>
        ) : !data || data.reviews.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-center mt-8" style={{ color: textSecondary }}>No reviews yet.</Text>
        ) : (
          data.reviews.map((r) => (
            <View key={r.id} className="p-[14px] border rounded-[12px]" style={{ backgroundColor: surfaceBg, borderColor }}>
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{r.rider_name}</Text>
                {renderStars(r.rating)}
              </View>
              {r.comment ? (
                <Text className="text-[14px] font-Jakarta mt-1 leading-5" style={{ color: textSecondary }}>{r.comment}</Text>
              ) : null}
              <Text className="text-[12px] font-Jakarta mt-2" style={{ color: textSecondary }}>{formatDate(r.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
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
