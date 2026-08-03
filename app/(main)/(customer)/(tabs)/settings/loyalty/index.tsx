import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import Skeleton from "@/components/Skeleton";

interface Offer { id: string; title: string; points_required: number; reward_type: string; reward_value_bdt: number | null; }
interface Tx { id: string; transaction_type: string; amount: number; balance_after: number; created_at: string; }

export default function RiderLoyalty() {
  const [balance, setBalance] = useState(0);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [history, setHistory] = useState<Tx[]>([]);
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
        setHistory(data.history ?? []);
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
        } catch (e: any) { Alert.alert("Error", "Network error"); }
        setRedeeming(null);
      }},
    ]);
  };

  if (loading) return <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark px-6 pt-8"><Skeleton width="100%" height={80} className="mb-4" /><Skeleton width="100%" height={70} className="mb-3" /><Skeleton width="100%" height={70} className="mb-3" /><Skeleton width="100%" height={70} className="mb-3" /></SafeAreaView>;

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Loyalty & Rewards</Text>
        <View className="w-12" />
      </View>
      <View className="items-center py-8">
        <Text className="text-4xl font-JakartaBold tracking-tight text-goPrimary">{balance}</Text>
        <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">Reward Points</Text>
      </View>
      <FlatList
        data={offers}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={<Text className="text-center text-goTextSecondaryLight dark:text-goTextSecondaryDark font-Jakarta py-8">No rewards available yet</Text>}
        renderItem={({ item }) => (
          <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-xl shadow-go-sm p-4 mb-3 flex-row items-center justify-between">
            <View className="flex-1">
              <Text className="text-base font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{item.title}</Text>
              <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-0.5">{item.points_required} points{item.reward_value_bdt ? ` • ৳${(item.reward_value_bdt / 100).toFixed(0)} credit` : ""}</Text>
            </View>
            <TouchableOpacity onPress={() => redeem(item)} disabled={redeeming === item.id || balance < item.points_required}
              className={`py-2 px-4 rounded-full ${balance >= item.points_required ? "bg-goPrimary" : "bg-goBorderDark"}`}>
              <Text className="text-goWhite font-JakartaBold text-sm">{redeeming === item.id ? "..." : "Redeem"}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
