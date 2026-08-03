import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

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
    } catch (err: any) {
      setError(err?.message || "Network error");
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
      <Text className="text-[16px] text-goPrimary">
        {"★".repeat(full)}{half ? "½" : ""}{"☆".repeat(empty)}
      </Text>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ratings & Reviews</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" className="mt-3" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mt-1">{error}</Text>
        ) : data ? (
          <View className="flex-row items-center gap-3 mt-1">
            <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary">★ {data.average_rating.toFixed(1)}</Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              {data.total_reviews} review{data.total_reviews !== 1 ? "s" : ""}
            </Text>
          </View>
        ) : null}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger">{error}</Text>
        ) : !data || data.reviews.length === 0 ? (
          <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark text-center mt-8">No reviews yet.</Text>
        ) : (
          data.reviews.map((r) => (
            <View key={r.id} className="p-[14px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px]">
              <View className="flex-row justify-between items-center">
                <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{r.rider_name}</Text>
                {renderStars(r.rating)}
              </View>
              {r.comment ? (
                <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1 leading-5">{r.comment}</Text>
              ) : null}
              <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-2">{formatDate(r.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}