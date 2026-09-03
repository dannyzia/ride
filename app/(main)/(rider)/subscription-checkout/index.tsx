import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import PaymentWebView from "@/components/PaymentWebView";
import { useTranslation } from "react-i18next";

interface Package {
  id: string;
  name: string;
  call_count: number;
  price_bdt: number;
  duration_days: number;
  is_trial: boolean;
  vehicle_type: string | null;
}

export default function SubscriptionCheckout() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const { planId } = useLocalSearchParams<{ planId: string }>();
  const [plan, setPlan] = useState<Package | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setPlanError("Not authenticated"); return; }
        const res = await fetch(`${API_URL}/api/package/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) { setPlanError(data.error || "Failed"); return; }
        const found = (data.packages ?? []).find((p: Package) => p.id === planId);
        if (!cancelled) setPlan(found ?? null);
      } catch (err) {
        if (!cancelled) setPlanError(err instanceof Error ? err.message : "Network error");
        logger.error("Checkout plan fetch failed", err);
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [planId]);

  const handlePay = async () => {
    if (!plan) return;
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/package/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ package_id: plan.id, provider: "portpos" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Payment failed"); return; }
      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setPaymentEventId(data.payment_event_id);
      } else {
        router.replace("/(main)/(rider)/subscription-confirmation");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Checkout failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (paymentUrl && paymentEventId) {
    return (
      <PaymentWebView
        bkashURL={paymentUrl}
        paymentID={paymentEventId}
        onSuccess={() => { setPaymentUrl(""); router.replace("/(main)/(rider)/subscription-confirmation"); }}
        onError={(msg) => { setPaymentUrl(""); setError(msg); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Checkout</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {planLoading ? (
          <View className="flex-1 items-center justify-center py-20">
            <ActivityIndicator size="large" color="#0CC25F" />
          </View>
        ) : planError ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-[14px] font-Jakarta text-goDanger text-center mb-4">{planError}</Text>
            <TouchableOpacity className="bg-goPrimary rounded-full px-[24px] py-[12px]" onPress={() => { setPlanLoading(true); setPlanError(""); }}>
              <Text className="text-[16px] font-JakartaBold text-goWhite">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !plan ? (
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-[16px] font-Jakarta" style={{ color: textSecondary }}>Plan not found</Text>
          </View>
        ) : (
          <>
            <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{plan.name}</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>{plan.call_count} calls · {plan.duration_days} days</Text>
              <Text className="text-[20px] font-JakartaBold tracking-tight text-goPrimary mt-2">৳{(plan.price_bdt / 100).toFixed(0)}</Text>
            </View>
            {error ? (
              <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
            ) : null}
            <TouchableOpacity
              className={`rounded-full w-full py-[16px] items-center mt-4 ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
              onPress={handlePay}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color="#FFFFFF" />
              ) : (
                <Text className="text-[18px] font-JakartaBold text-goWhite">Pay Now</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
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
