import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, FlatList, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import Skeleton from "@/components/Skeleton";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface Offer { id: string; title: string; points_required: number; reward_type: string; reward_value_bdt: number | null; }

export default function RiderLoyalty() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;

  const [balance, setBalance] = useState(0);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/rider/points`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance ?? 0);
        setOffers(data.offers ?? []);
      }
    } catch (e) { logger.error("Loyalty fetch failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const redeem = (offer: Offer) => {
    Alert.alert("Redeem?", `${offer.title} for ${offer.points_required} points?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Redeem", onPress: async () => {
        setRedeeming(offer.id);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          const res = await fetch(`${API_URL}/api/rider/points`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ offer_id: offer.id }),
          });
          const data = await res.json();
          if (res.ok) { Alert.alert("Redeemed!", `Reward: ৳${((data.reward_bdt ?? 0) / 100).toFixed(0)}`); fetchData(); }
          else { Alert.alert("Error", data.error ?? "Failed"); }
        } catch (_e) { Alert.alert("Error", "Network error"); }
        setRedeeming(null);
      }},
    ]);
  };

  if (loading) return (
    <SafeAreaView className="flex-1 px-6 pt-8" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <Skeleton width="100%" height={80} className="mb-4" /><Skeleton width="100%" height={70} className="mb-3" /><Skeleton width="100%" height={70} className="mb-3" /><Skeleton width="100%" height={70} className="mb-3" />
    </SafeAreaView>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="font-Jakarta text-base" style={{ color: colors.primary }}>Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Loyalty & Rewards</Text>
        <View className="w-12" />
      </View>
      <View className="items-center py-8">
        <Text className="text-4xl font-JakartaBold tracking-tight" style={{ color: colors.primary }}>{balance}</Text>
        <Text className="text-sm font-Jakarta mt-1" style={{ color: textSecondary }}>Reward Points</Text>
      </View>
      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={<Text className="text-center font-Jakarta py-8" style={{ color: textSecondary }}>No rewards available yet</Text>}
        renderItem={({ item }) => (
          <View className="border rounded-xl shadow-go-sm p-4 mb-3 flex-row items-center justify-between" style={{ backgroundColor: surfaceBg, borderColor }}>
            <View className="flex-1">
              <Text className="text-base font-JakartaBold" style={{ color: textPrimary }}>{item.title}</Text>
              <Text className="text-sm font-Jakarta mt-0.5" style={{ color: textSecondary }}>{item.points_required} points{item.reward_value_bdt ? ` • ৳${(item.reward_value_bdt / 100).toFixed(0)} credit` : ""}</Text>
            </View>
            <TouchableOpacity onPress={() => redeem(item)} disabled={redeeming === item.id || balance < item.points_required}
              className="py-2 px-4 rounded-full"
              style={{ backgroundColor: balance >= item.points_required ? colors.primary : disabledBg }}>
              <Text className="text-goWhite font-JakartaBold text-sm">{redeeming === item.id ? "..." : "Redeem"}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
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
