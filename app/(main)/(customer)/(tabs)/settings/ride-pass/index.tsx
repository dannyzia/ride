import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";
import AnimatedCard from "@/components/AnimatedCard";

interface RidePass {
  id: string; name: string; description: string | null; price_bdt: number;
  discount_percent: number; max_rides: number | null; validity_days: number; is_active: boolean;
}

interface ActiveSubscription {
  pass_id: string; pass_name: string; status: string; rides_used: number; valid_until: string; max_rides: number | null;
}

export default function RidePassPurchase() {
  const [passes, setPasses] = useState<RidePass[]>([]);
  const [activeSub, setActiveSub] = useState<ActiveSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const fetchPasses = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/passes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPasses(data.passes ?? []);
        if (data.active_subscription) {
          const [pass] = data.passes.filter((p: RidePass) => p.id === data.active_subscription.pass_id);
          setActiveSub({
            pass_id: data.active_subscription.pass_id,
            pass_name: pass?.name ?? "Unknown",
            status: data.active_subscription.status,
            rides_used: data.active_subscription.rides_used ?? 0,
            valid_until: data.active_subscription.valid_until,
            max_rides: pass?.max_rides ?? null,
          });
        }
      }
    } catch (e) { logger.error("Fetch passes failed", e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);

  const buyPass = async (passId: string) => {
    setPurchasing(passId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { Alert.alert("Error", "Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/passes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pass_id: passId }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Error", data.error ?? "Purchase failed"); return; }
      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setPaymentEventId(data.payment_event_id);
      } else {
        Alert.alert("Success", "Pass activated!");
        fetchPasses();
      }
    } catch (err: any) { Alert.alert("Error", err.message); }
    finally { setPurchasing(null); }
  };

  if (paymentUrl) {
    return (
      <PaymentWebView
        bkashURL={paymentUrl}
        paymentID={paymentEventId}
        onSuccess={() => { setPaymentUrl(""); Alert.alert("Success", "Pass activated!"); fetchPasses(); }}
        onError={(err) => { setPaymentUrl(""); Alert.alert("Payment Failed", err ?? "Failed"); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-6 py-4 border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}><Text className="text-goPrimary font-Jakarta text-base">Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Ride Pass</Text>
        <View className="w-12" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#0A9B4C" /></View>
      ) : (
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16 }}>
          {activeSub && (
            <View className="bg-goAccentLight dark:bg-goAccent/10 rounded-xl p-4 mb-6 border border-goAccent/30">
              <Text className="text-sm font-JakartaBold text-goAccent mb-1">Active Pass</Text>
              <Text className="text-lg font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{activeSub.pass_name}</Text>
              <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">
                Rides: {activeSub.rides_used}{activeSub.max_rides ? ` / ${activeSub.max_rides}` : " (unlimited)"}
              </Text>
              <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                Expires: {new Date(activeSub.valid_until).toLocaleDateString()}
              </Text>
            </View>
          )}
          {passes.map((p, i) => (
            <AnimatedCard key={p.id} index={i} className="mb-3">
              <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-xl shadow-go-sm p-4">
              <Text className="text-base font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{p.name}</Text>
              {p.description ? <Text className="text-sm font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">{p.description}</Text> : null}
              <View className="flex-row items-center justify-between mt-3">
                <View>
                  <Text className="text-lg font-JakartaBold text-goPrimary">৳{(p.price_bdt / 100).toFixed(0)}</Text>
                  <Text className="text-xs font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{p.discount_percent}% off · {p.validity_days} days{p.max_rides ? ` · ${p.max_rides} rides` : ""}</Text>
                </View>
                <TouchableOpacity onPress={() => buyPass(p.id)} disabled={purchasing === p.id}
                  className={`py-2 px-4 rounded-full ${purchasing === p.id ? "bg-goBorderDark" : "bg-goPrimary"}`}>
                  <Text className="text-goWhite font-JakartaBold text-sm">{purchasing === p.id ? "..." : "Buy"}</Text>
                </TouchableOpacity>
              </View>
            </View>
            </AnimatedCard>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
