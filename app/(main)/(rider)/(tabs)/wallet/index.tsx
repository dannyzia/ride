import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function WalletScreen() {
  const isDark = useIsDark();
  const [balancePaisa, setBalancePaisa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<any[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchWallet = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/driver/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError("Failed to load wallet"); return; }
      const data = await res.json();
      setBalancePaisa(data.balance_bdt ?? 0);
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Wallet fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCredits = useCallback(async () => {
    setCreditsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/cancellation-credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCredits(data.credits ?? []);
    } catch (err: any) {
      logger.error("Cancellation credits fetch failed", err);
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);
  useEffect(() => { fetchCredits(); }, [fetchCredits]);

  const pendingCount = credits.filter((c) => c.status === "pending").length;
  const totalPendingBdt = credits
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.amount_bdt, 0);

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <View className="px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>Wallet</Text>
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} className="mt-3" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta mt-2" style={{ color: colors.danger }}>{error}</Text>
        ) : (
          <>
            <Text className="text-[32px] font-JakartaBold tracking-tight mt-1" style={{ color: colors.primary }}>৳{(balancePaisa / 100).toFixed(0)}</Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
              Total earnings tracker
            </Text>
          </>
        )}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <View className="border rounded-[12px] p-[14px]" style={{ backgroundColor: surfaceBg, borderColor }}>
          <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>
            Total earnings are credited here at ride completion and from gamification rewards. No withdrawals are available yet.
          </Text>
        </View>

        {/* Cancellation Compensation Section */}
        <View className="border rounded-[12px] p-[14px]" style={{ backgroundColor: surfaceBg, borderColor }}>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-[14px] font-JakartaSemiBold" style={{ color: textPrimary }}>
              Cancellation Compensation
            </Text>
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
              {pendingCount} pending
            </Text>
          </View>
          {creditsLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : credits.length === 0 ? (
            <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
              No cancellation compensations yet.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {credits.map((credit) => {
                const statusColor =
                  credit.status === "pending"
                    ? colors.accent
                    : credit.status === "applied"
                    ? colors.primary
                    : textSecondary;
                return (
                  <View key={credit.id} className="flex-row justify-between items-center py-2 border-b last:border-0" style={{ borderColor }}>
                    <View>
                      <Text className="text-[13px] font-JakartaSemiBold" style={{ color: textPrimary }}>
                        ৳{(credit.amount_bdt / 100).toFixed(0)} bonus
                      </Text>
                      <Text className="text-[11px] font-Jakarta" style={{ color: textSecondary }}>
                        {credit.created_at ? new Date(credit.created_at).toLocaleDateString("en-BD") : ""}
                      </Text>
                    </View>
                    <Text className="text-[12px] font-JakartaSemiBold" style={{ color: statusColor }}>
                      {credit.status.toUpperCase()}
                    </Text>
                  </View>
                );
              })}
              {totalPendingBdt > 0 && (
                <View className="flex-row justify-between items-center pt-2 border-t" style={{ borderColor }}>
                  <Text className="text-[13px] font-JakartaSemiBold" style={{ color: textPrimary }}>
                    Total pending credits
                  </Text>
                  <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>
                    ৳{(totalPendingBdt / 100).toFixed(0)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
