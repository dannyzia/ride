import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";

const PRESETS = [200, 500, 1000, 2000];

export default function WalletTopUp() {
  const [amountTaka, setAmountTaka] = useState("500");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentUrl, setPaymentUrl] = useState("");
  const [paymentEventId, setPaymentEventId] = useState("");

  const handleTopUp = async () => {
    const taka = parseInt(amountTaka, 10);
    if (!taka || taka < 50) { setError("Minimum ৳50"); return; }
    if (taka > 25000) { setError("Maximum ৳25,000"); return; }
    setLoading(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: taka * 100 }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Payment failed");
        return;
      }
      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setPaymentEventId(data.payment_event_id);
      } else {
        Alert.alert("Success", `৳${taka} added to wallet`, [{ text: "OK", onPress: () => router.back() }]);
      }
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Top-up failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (paymentUrl && paymentEventId) {
    return (
      <PaymentWebView
        bkashURL={paymentUrl}
        paymentID={paymentEventId}
        onSuccess={() => { setPaymentUrl(""); Alert.alert("Success", "Wallet topped up!", [{ text: "OK", onPress: () => router.back() }]); }}
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
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Top Up Wallet</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] pt-[24px]">
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Enter amount (BDT)</Text>
        <View className="flex-row items-center bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] mb-4">
          <Text className="text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark mr-2">৳</Text>
          <TextInput
            className="flex-1 py-[14px] text-[18px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            keyboardType="numeric"
            value={amountTaka}
            onChangeText={setAmountTaka}
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View className="flex-row flex-wrap gap-2 mb-6">
          {PRESETS.map((p) => (
            <TouchableOpacity
              key={p}
              className={`px-[16px] py-[8px] rounded-full border ${parseInt(amountTaka, 10) === p ? "border-goPrimary bg-goAccentLight dark:bg-goPrimary/20" : "border-goBorderLight dark:border-goBorderDark"}`}
              onPress={() => setAmountTaka(String(p))}
            >
              <Text className={`text-[14px] font-JakartaBold ${parseInt(amountTaka, 10) === p ? "text-goPrimary" : "text-goTextSecondaryLight dark:text-goTextSecondaryDark"}`}>৳{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {error ? <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text> : null}
        <TouchableOpacity
          className={`rounded-full w-full py-[16px] items-center ${loading || !amountTaka ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleTopUp}
          disabled={loading || !amountTaka}
        >
          {loading ? <ActivityIndicator size={20} color="#FFFFFF" /> : <Text className="text-[18px] font-JakartaBold text-goWhite">Add ৳{amountTaka || "0"}</Text>}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
