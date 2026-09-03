import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

export default function TopUpMethod() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const disabledBg = isDark ? colors.borderDark : colors.borderLight;

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
      if (!token) { setError(t('wallet.not_authenticated')); return; }
      const res = await fetch(`${API_URL}/api/rider/wallet/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_bdt: parseInt(amount || "500", 10) * 100 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || t('top_up_method.payment_failed')); return; }
      if (data.payment_url) {
        setPaymentUrl(data.payment_url);
        setPaymentEventId(data.payment_event_id);
      } else {
        router.replace(`/(main)/(customer)/(tabs)/settings/top-up-success?amount=${amount}`);
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('wallet.network_error'));
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
        onError={(err) => { setPaymentUrl(""); setError(err || t('top_up_method.payment_failed')); }}
      />
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('top_up_method.payment')}</Text>
        <View className="w-[50px]" />
      </View>
      <View className="flex-1 px-[24px] pt-[24px]">
        <Text className="text-[15px] font-Jakarta mb-1" style={{ color: textSecondary }}>
          {t('top_up_method.amount')}
        </Text>
        <Text className="text-[28px] font-JakartaBold tracking-tight mb-6" style={{ color: textPrimary }}>
          ৳{amount ?? "500"}
        </Text>
        <Text className="text-[15px] font-Jakarta mb-6" style={{ color: textSecondary }}>
          {t('top_up_method.redirect_notice')}
        </Text>
        {error ? (
          <Text className="text-[14px] font-Jakarta mb-3" style={{ color: colors.danger }}>{error}</Text>
        ) : null}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center mt-4"
          style={{ backgroundColor: loading ? disabledBg : colors.primary }}
          onPress={handlePay}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">{t('top_up_method.pay', { amount: amount ?? "500" })}</Text>
          )}
        </TouchableOpacity>
      </View>
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
