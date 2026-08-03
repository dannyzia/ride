import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export default function WalletScreen() {
  const [balancePaisa, setBalancePaisa] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [credits, setCredits] = useState<any[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(false);

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
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <Text className="text-[20px] font-JakartaBold tracking-tight text-goTextPrimaryLight dark:text-goTextPrimaryDark">Wallet</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#0CC25F" className="mt-3" />
        ) : error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mt-2">{error}</Text>
        ) : (
          <>
            <Text className="text-[32px] font-JakartaBold tracking-tight text-goPrimary mt-1">৳{(balancePaisa / 100).toFixed(0)}</Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              Total earnings tracker
            </Text>
          </>
        )}
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16, gap: 12 }}>
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[14px]">
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
            Total earnings are credited here at ride completion and from gamification rewards. No withdrawals are available yet.
          </Text>
        </View>

        {/* Cancellation Compensation Section */}
        <View className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[12px] p-[14px]">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-[14px] font-JakartaSemiBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
              Cancellation Compensation
            </Text>
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              {pendingCount} pending
            </Text>
          </View>
          {creditsLoading ? (
            <ActivityIndicator size="small" color="#0CC25F" />
          ) : credits.length === 0 ? (
            <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
              No cancellation compensations yet.
            </Text>
          ) : (
            <View style={{ gap: 8 }}>
              {credits.map((credit) => (
                <View key={credit.id} className="flex-row justify-between items-center py-2 border-b border-goBorderLight dark:border-goBorderDark last:border-0">
                  <View>
                    <Text className="text-[13px] font-JakartaSemiBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                      ৳{(credit.amount_bdt / 100).toFixed(0)} bonus
                    </Text>
                    <Text className="text-[11px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">
                      {credit.created_at ? new Date(credit.created_at).toLocaleDateString("en-BD") : ""}
                    </Text>
                  </View>
                  <Text className={`text-[12px] font-Jakarta font-JakartaSemiBold ${
                    credit.status === "pending"
                      ? "text-goAccent"
                      : credit.status === "applied"
                      ? "text-goPrimary"
                      : "text-goTextSecondaryLight dark:text-goTextSecondaryDark"
                  }`}>
                    {credit.status.toUpperCase()}
                  </Text>
                </View>
              ))}
              {totalPendingBdt > 0 && (
                <View className="flex-row justify-between items-center pt-2 border-t border-goBorderLight dark:border-goBorderDark">
                  <Text className="text-[13px] font-JakartaSemiBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
                    Total pending credits
                  </Text>
                  <Text className="text-[14px] font-JakartaBold text-goPrimary">
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