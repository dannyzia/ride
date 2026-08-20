import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";
import AnimatedCard from "@/components/AnimatedCard";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface RidePass {
  id: string; name: string; description: string | null; price_bdt: number;
  discount_percent: number; max_rides: number | null; validity_days: number; is_active: boolean;
}

interface ActiveSubscription {
  pass_id: string; pass_name: string; status: string; rides_used: number; valid_until: string; max_rides: number | null;
}

export default function RidePassPurchase() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const [passes, setPasses] = useState<RidePass[]>([]);
  const [activeSub, setActiveSub] = useState<ActiveSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchPasses = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/rider/passes`, { headers: { Authorization: `Bearer ${token}` } });
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
      const res = await fetch(`${API_URL}/api/rider/passes`, {
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
    } catch (err) { Alert.alert("Error", err instanceof Error ? err.message : String(err)); }
    finally { setPurchasing(null); }
  };

  if (paymentUrl) {
    return (
      <PaymentWebView
        bkashURL={paymentUrl}
        paymentID={paymentEventId}
        purpose="rider_pass"
        onSuccess={() => { setPaymentUrl(""); Alert.alert("Success", "Pass activated!"); fetchPasses(); }}
        onError={(err) => { setPaymentUrl(""); Alert.alert("Payment Failed", err ?? "Failed"); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-6 py-4 border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}><Text className="font-Jakarta text-base" style={{ color: colors.primary }}>Back</Text></TouchableOpacity>
        <Text className="flex-1 text-center text-lg font-JakartaBold" style={{ color: textPrimary }}>Ride Pass</Text>
        <View className="w-12" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <ScrollView className="flex-1 px-6" contentContainerStyle={{ paddingVertical: 16 }}>
          {activeSub && (
            <View
              className="rounded-xl p-4 mb-6 border"
              style={{ backgroundColor: isDark ? "rgba(12, 194, 95, 0.1)" : colors.accentLight, borderColor: colors.accent + "4D" }}
            >
              <Text className="text-sm font-JakartaBold mb-1" style={{ color: colors.accent }}>Active Pass</Text>
              <Text className="text-lg font-JakartaBold" style={{ color: textPrimary }}>{activeSub.pass_name}</Text>
              {activeSub.max_rides ? (
                <View className="mt-2 mb-1">
                  <View
                    className="h-2 rounded w-full"
                    style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}
                  >
                    <View
                      className="h-2 rounded"
                      style={{
                        width: `${Math.min(100, Math.max(0, (activeSub.rides_used / activeSub.max_rides) * 100))}%`,
                        backgroundColor: colors.primary,
                      }}
                    />
                  </View>
                  <Text className="font-Jakarta mt-1" style={{ color: textSecondary, fontSize: 13 }}>
                    {activeSub.rides_used} of {activeSub.max_rides} rides
                  </Text>
                </View>
              ) : (
                <Text className="text-sm font-Jakarta mt-1" style={{ color: textSecondary }}>
                  Rides: {activeSub.rides_used} (unlimited)
                </Text>
              )}
              <Text className="text-sm font-Jakarta" style={{ color: textSecondary }}>
                Expires: {new Date(activeSub.valid_until).toLocaleDateString()}
              </Text>
            </View>
          )}
          {passes.map((p, i) => (
            <AnimatedCard key={p.id} index={i} className="mb-3">
              <View className="border rounded-xl shadow-go-sm p-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-base font-JakartaBold" style={{ color: textPrimary }}>{p.name}</Text>
              {p.description ? <Text className="text-sm font-Jakarta mt-1" style={{ color: textSecondary }}>{p.description}</Text> : null}
              <View className="flex-row items-center justify-between mt-3">
                <View>
                  <Text className="text-lg font-JakartaBold" style={{ color: colors.primary }}>৳{(p.price_bdt / 100).toFixed(0)}</Text>
                  <Text className="text-xs font-Jakarta" style={{ color: textSecondary }}>{p.discount_percent}% off · {p.validity_days} days{p.max_rides ? ` · ${p.max_rides} rides` : ""}</Text>
                </View>
                <TouchableOpacity onPress={() => buyPass(p.id)} disabled={purchasing === p.id}
                  className="py-2 px-4 rounded-full"
                  style={{ backgroundColor: purchasing === p.id ? disabledBg : colors.primary }}>
                  <Text className="text-goWhite font-JakartaBold text-sm">{purchasing === p.id ? "..." : "Buy"}</Text>
                </TouchableOpacity>
              </View>
            </View>
            </AnimatedCard>
          ))}
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
