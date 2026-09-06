import { useState, useEffect, useCallback , useState as useStateModal } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";
import { useDriverStore } from "@/store/useDriverStore";

import PaymentWebView from "@/components/PaymentWebView";
import { useTranslation } from "react-i18next";

interface DuesData {
  subscription: {
    package_name: string;
    expires_at: string;
    calls_remaining: number;
    status: string;
  } | null;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
}

interface Transaction {
  id: string;
  transaction_type: string;
  amount_bdt: number;
  balance_after: number;
  created_at: string;
}

interface CancellationCredit {
  id: string;
  amount_bdt: number;
  status: string;
  created_at: string | null;
}

// P0-B: Instant Pay disabled – product gate pending. See
// docs/payout-product-gate.md. No Withdraw/cash-out control, payout-history
// write route, or 'payout' transaction label may appear until Product
// approves the funding/payout model.
const TXN_TYPE_LABELS: Record<string, string> = {
  promo_receivable: "Promo Credit",
  referral_receivable: "Referral Bonus",
  adjustment: "Adjustment",
  cancellation_compensation: "Cancel Bonus",
};

export default function WalletScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [balancePaisa, setBalancePaisa] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [dues, setDues] = useState<DuesData | null>(null);
  const [credits, setCredits] = useState<CancellationCredit[]>([]);

  const activeSubscription = useDriverStore((s) => s.activeSubscription);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchWallet = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('wallet.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(t('wallet.failed_to_load'));
        return;
      }
      const data = await res.json();
      setBalancePaisa(data.balance_bdt ?? 0);
      setTransactions(data.recent_transactions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('wallet.network_error'));
      logger.error("Wallet fetch failed", err);
    }
  }, []);

  const fetchDues = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/dues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDues(await res.json());
    } catch {}
  }, []);

  const fetchCredits = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/cancellation-credits`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCredits(data.credits ?? []);
      }
    } catch (err) {
      logger.error("Cancellation credits fetch failed", err);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    await Promise.all([fetchWallet(), fetchDues(), fetchCredits()]);
    setLoading(false);
  }, [fetchWallet, fetchDues, fetchCredits]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchWallet(), fetchDues(), fetchCredits()]);
    setRefreshing(false);
  }, [fetchWallet, fetchDues, fetchCredits]);

  // C2: Wallet top-up via PortPos PaymentWebView
  const [topUpUrl, setTopUpUrl] = useStateModal<string | null>(null);
  const [topUpInvoiceId, setTopUpInvoiceId] = useStateModal<string | null>(null);

  const handleTopUp = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/wallet/topup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount_bdt: 0 }), // amount determined by PortPos redirect
      });
      if (res.ok) {
        const data = await res.json();
        if (data.payment_url) {
          setTopUpUrl(data.payment_url);
          setTopUpInvoiceId(data.payment_event_id ?? "");
        }
      }
    } catch {
      // Non-blocking — user can retry
    }
  }, []);

  const pendingCredits = credits.filter((c) => c.status === "pending");
  const totalPendingBdt = pendingCredits.reduce(
    (sum, c) => sum + c.amount_bdt,
    0,
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="px-[24px] py-[16px] border-b"
        style={{ borderColor }}
      >
        <Text
          className="text-[20px] font-JakartaBold tracking-tight"
          style={{ color: textPrimary }}
        >
          {t('wallet.title')}
        </Text>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={colors.primary}
            className="mt-3"
          />
        ) : error ? (
          <Text
            className="text-[14px] font-Jakarta mt-2"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : (
          <>
            <Text
              className="text-[32px] font-JakartaBold tracking-tight mt-1"
              style={{ color: textPrimary }}
            >
              {formatBDT(balancePaisa)}
            </Text>
            <Text
              className="text-[13px] font-Jakarta"
              style={{ color: textSecondary }}
            >
              {t('wallet.balance')}
            </Text>
          </>
        )}
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 16, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
      >
        {/* Active Package Card */}
        {activeSubscription && (
          <View
            className="rounded-[12px] p-[14px]"
            style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons name="cube-outline" size={16} color={colors.primary} />
              <Text
                className="text-[14px] font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                {t('wallet.active_package')}
              </Text>
            </View>
            <View className="flex-row justify-between items-center">
              <View>
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: textSecondary }}
                >
                  {t('wallet.calls_remaining')}
                </Text>
                <Text
                  className="text-[20px] font-JakartaBold"
                  style={{ color: textPrimary }}
                >
                  {activeSubscription.calls_remaining === -1
                    ? t('wallet.unlimited')
                    : activeSubscription.calls_remaining}
                </Text>
              </View>
              <View className="items-end">
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: textSecondary }}
                >
                  {t('wallet.expires')}
                </Text>
                <Text
                  className="text-[14px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  {new Date(activeSubscription.expires_at).toLocaleDateString(
                    "en-BD",
                    { day: "numeric", month: "short", timeZone: "Asia/Dhaka" },
                  )}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Dues Card */}
        {dues && dues.total_outstanding_bdt > 0 && (
          <View
            className="rounded-[12px] p-[14px]"
            style={{
              backgroundColor: `${colors.danger}08`,
              borderWidth: 1,
              borderColor: `${colors.danger}30`,
            }}
          >
            <View className="flex-row items-center gap-2 mb-2">
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={colors.danger}
              />
              <Text
                className="text-[14px] font-JakartaSemiBold"
                style={{ color: colors.danger }}
              >
                {t('wallet.outstanding_dues')}
              </Text>
            </View>
            <Text
              className="text-[18px] font-JakartaBold"
              style={{ color: colors.danger }}
            >
              {formatBDT(dues.total_outstanding_bdt)}
            </Text>
            <Text
              className="text-[12px] font-Jakarta mt-1"
              style={{ color: textSecondary }}
            >
              {t('wallet.commission_owed')}
            </Text>
          </View>
        )}

        {/* Top Up Button */}
        <TouchableOpacity
          className="rounded-[12px] py-[14px] items-center flex-row justify-center gap-2"
          style={{ backgroundColor: colors.primary }}
          onPress={handleTopUp}
          accessibilityRole="button"
          accessibilityLabel={t('wallet.top_up')}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.white} />
          <Text className="text-[16px] font-JakartaBold text-white">
            {t('wallet.top_up')}
          </Text>
        </TouchableOpacity>

        {/* Payout Method shortcut */}
        <TouchableOpacity
          className="rounded-[12px] p-[14px] flex-row items-center justify-between"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          onPress={() => router.push("/(main)/(rider)/payout-method")}
        >
          <View className="flex-row items-center gap-2">
            <Ionicons
              name="card-outline"
              size={18}
              color={colors.primary}
            />
            <Text
              className="text-[14px] font-JakartaSemiBold"
              style={{ color: textPrimary }}
            >
              {t('wallet.payout_method')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={textSecondary} />
        </TouchableOpacity>

        {/* Cancellation Credits */}
        {credits.length > 0 && (
          <View
            className="rounded-[12px] p-[14px]"
            style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
          >
            <View className="flex-row justify-between items-center mb-2">
              <Text
                className="text-[14px] font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                {t('wallet.cancellation_credits')}
              </Text>
              <Text
                className="text-[13px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                {pendingCredits.length} pending
              </Text>
            </View>
            {credits.slice(0, 5).map((credit) => {
              const statusColor =
                credit.status === "pending"
                  ? colors.accent
                  : credit.status === "applied"
                    ? colors.primary
                    : textSecondary;
              return (
                <View
                  key={credit.id}
                  className="flex-row justify-between items-center py-2 border-b last:border-0"
                  style={{ borderColor }}
                >
                  <View>
                    <Text
                      className="text-[13px] font-JakartaSemiBold"
                      style={{ color: textPrimary }}
                    >
                      {formatBDT(credit.amount_bdt)} {t('wallet.bonus')}
                    </Text>
                    <Text
                      className="text-[11px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      {credit.created_at
                        ? new Date(credit.created_at).toLocaleDateString(
                            "en-BD",
                          )
                        : ""}
                    </Text>
                  </View>
                  <Text
                    className="text-[12px] font-JakartaSemiBold"
                    style={{ color: statusColor }}
                  >
                    {credit.status.toUpperCase()}
                  </Text>
                </View>
              );
            })}
            {totalPendingBdt > 0 && (
              <View
                className="flex-row justify-between items-center pt-2 border-t"
                style={{ borderColor }}
              >
                <Text
                  className="text-[13px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  {t('wallet.total_pending')}
                </Text>
                <Text
                  className="text-[14px] font-JakartaBold"
                  style={{ color: colors.primary }}
                >
                  {formatBDT(totalPendingBdt)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Recent Transactions */}
        {transactions.length > 0 && (
          <View>
            <Text
              className="text-[16px] font-JakartaBold mb-2"
              style={{ color: textPrimary }}
            >
              {t('wallet.recent_transactions')}
            </Text>
            {transactions.map((txn) => (
              <View
                key={txn.id}
                className="rounded-[12px] p-[14px] mb-2 flex-row justify-between items-center"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
              >
                <View className="flex-1">
                  <Text
                    className="text-[14px] font-JakartaSemiBold"
                    style={{ color: textPrimary }}
                  >
                    {TXN_TYPE_LABELS[txn.transaction_type] ?? txn.transaction_type}
                  </Text>
                  <Text
                    className="text-[12px] font-Jakarta mt-0.5"
                    style={{ color: textSecondary }}
                  >
                    {new Date(txn.created_at).toLocaleDateString("en-BD", {
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                      timeZone: "Asia/Dhaka",
                    })}
                  </Text>
                </View>
                <View className="items-end">
                  <Text
                    className="text-[14px] font-JakartaBold"
                    style={{
                      color: txn.amount_bdt >= 0 ? colors.success : colors.danger,
                    }}
                  >
                    {txn.amount_bdt >= 0 ? "+" : ""}
                    {formatBDT(txn.amount_bdt)}
                  </Text>
                  <Text
                    className="text-[11px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    Bal: {formatBDT(txn.balance_after)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Offline note */}
        <View
          className="rounded-[12px] p-[14px] mt-2"
          style={{ backgroundColor: `${colors.info}10`, borderWidth: 1, borderColor: `${colors.info}20` }}
        >
          <Text
            className="text-[13px] font-Jakarta"
            style={{ color: textSecondary }}
          >
            {t('wallet.wallet_note')}
          </Text>
        </View>
      </ScrollView>

      {/* C2: PaymentWebView for wallet top-up */}
      {topUpUrl && topUpInvoiceId && (
        <PaymentWebView
          bkashURL={topUpUrl}
          paymentID={topUpInvoiceId}
          purpose="wallet_topup"
          onSuccess={() => {
            setTopUpUrl(null);
            setTopUpInvoiceId(null);
            void handleRefresh();
          }}
          onError={() => {
            setTopUpUrl(null);
            setTopUpInvoiceId(null);
          }}
        />
      )}
    </SafeAreaView>
  );
}
