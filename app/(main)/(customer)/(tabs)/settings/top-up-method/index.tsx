import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";

export default function TopUpMethod() {
  const { amount } = useLocalSearchParams<{ amount: string }>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");

  const handlePay = async () => {
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: parseInt(amount || "500", 10) * 100 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Payment failed"); return; }
      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setPaymentEventId(data.payment_event_id);
      } else {
        router.replace(`/(main)/(customer)/(tabs)/settings/top-up-success?amount=${amount}`);
      }
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Top-up payment failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (paymentUrl) {
    return (
      <PaymentWebView
        bkashURL={paymentUrl}
        paymentID={paymentEventId}
        onSuccess={() => router.replace(`/(main)/(customer)/(tabs)/settings/top-up-success?amount=${amount}`)}
        onError={(err) => { setPaymentUrl(""); setError(err || "Payment failed"); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Payment</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] pt-[24px]">
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-1">
          Amount
        </Text>
        <Text className="text-[28px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-6">
          ৳{amount ?? "500"}
        </Text>
        <Text className="text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-6">
          You will be redirected to our secure payment partner (PortPos) to complete your top-up.
        </Text>
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
            <Text className="text-[18px] font-JakartaBold text-goWhite">Pay ৳{amount ?? "500"}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
