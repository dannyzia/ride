import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";

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
      } catch (err: any) {
        if (!cancelled) setPlanError(err?.message || "Network error");
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
    } catch (err: any) {
      setError(err?.message || "Network error");
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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Checkout</Text>
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
            <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">Plan not found</Text>
          </View>
        ) : (
          <>
            <View className="p-[16px] bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] mb-4">
              <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{plan.name}</Text>
              <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">{plan.call_count} calls · {plan.duration_days} days</Text>
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
    </SafeAreaView>
  );
}
