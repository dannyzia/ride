import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

const TX_LABEL_KEYS: Record<string, string> = {
  promo_receivable: "wallet.transaction_types.promo_receivable",
  referral_receivable: "wallet.transaction_types.referral_receivable",
  payout: "wallet.transaction_types.payout",
  adjustment: "wallet.transaction_types.adjustment",
  cancellation_compensation: "wallet.transaction_types.cancellation_compensation",
};

interface WalletTransaction {
  transaction_type: string;
  created_at: string;
  amount_bdt: number;
}

export default function ActivityTopUp() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const [walletBalance, setWalletBalance] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/rider/wallet`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWalletBalance(data.balance_bdt ?? 0);
          setTransactions(data.recent_transactions ?? []);
        } else {
          setError(t('wallet.failed_to_load'));
        }
      } catch (e) {
        setError(t('wallet.failed_to_load'));
        logger.error("[top-up] fetch failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px]" style={{ borderBottomWidth: 1, borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.replace("/(main)/(customer)/(tabs)/activity")}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('wallet.top_up')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-center mt-8" style={{ color: colors.danger }}>{error}</Text>
        ) : (
          <>
            <View className="mt-4 mb-4">
              <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('top_up.wallet_balance')}</Text>
              <Text className="text-[24px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>৳{(walletBalance / 100).toFixed(0)}</Text>
            </View>
            <View className="mb-4">
              <Text className="text-[16px] font-JakartaBold mb-2" style={{ color: textPrimary }}>{t('wallet.recent_transactions')}</Text>
              {transactions.length > 0 ? (
                transactions.map((tx, index) => (
                  <View key={index} className="mb-2 flex-row items-center px-[12px] py-[8px] border rounded-[8px]" style={{ backgroundColor: surfaceBg, borderColor }}>
                    <View className="flex-1">
                      <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>{TX_LABEL_KEYS[tx.transaction_type] ? t(TX_LABEL_KEYS[tx.transaction_type]) : tx.transaction_type}</Text>
                      <Text className="text-[11px] font-Jakarta" style={{ color: textSecondary }}>{new Date(tx.created_at).toLocaleDateString()}</Text>
                    </View>
                    <Text
                      className="text-[12px] font-JakartaBold"
                      style={{ color: (tx.amount_bdt ?? 0) >= 0 ? colors.primary : colors.danger }}
                    >
                      ৳{((tx.amount_bdt ?? 0) / 100).toFixed(0)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-[14px] font-Jakarta text-center py-[16px]" style={{ color: textSecondary }}>{t('top_up.no_transactions')}</Text>
              )}
            </View>
          </>
        )}
        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{ backgroundColor: colors.primary }}
          onPress={() => router.push("/(main)/(customer)/(tabs)/settings/top-up")}
        >
          <Text className="text-[18px] font-JakartaBold" style={{ color: colors.white }}>{t('top_up.top_up_wallet')}</Text>
        </TouchableOpacity>
      </ScrollView>
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
