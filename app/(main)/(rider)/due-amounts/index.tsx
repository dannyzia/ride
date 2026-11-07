// Stage 3b — Driver dues screen (Item 25 / DESIGN-POSTPAID-MONETIZATION.md §5).
//
// Enhanced due-amounts screen: itemized open subscription bills with per-line
// pay (bill_id routing to /api/driver/dues/pay), six-state monetization_state
// banner, credit headroom warning, frozen/active subscription info.
// All figures come from GET /api/driver/dues (server-computed canonical total).
import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";
import { useTranslation } from "react-i18next";
import PaymentWebView from "@/components/PaymentWebView";

interface OpenBill {
  id: string;
  amount_bdt: number;
  due_at: string | null;
}

interface SubscriptionInfo {
  package_name: string | null;
  calls_remaining: number | null;
  expires_at: string | null;
  status: string;
  frozen_at: string | null;
}

type MonetizationState =
  | "NO_PRODUCT"
  | "CEILING_LOCKED"
  | "LAPSED"
  | "OWING"
  | "PRODUCT_FROZEN"
  | "ACTIVE";

interface DuesData {
  subscription: SubscriptionInfo | null;
  active_subscription: SubscriptionInfo | null;
  frozen_subscription: SubscriptionInfo | null;
  revenue_model?: "subscription_only" | "commission_only" | "hybrid";
  monetization_state?: MonetizationState;
  commission_accrued_bdt?: number;
  commission_settled_bdt?: number;
  commission_due_bdt: number;
  total_outstanding_bdt: number;
  max_debt_limit_bdt?: number;
  credit_headroom_paisa?: number;
  is_dispatch_locked?: boolean;
  dispatch_lock_reason?: string;
  open_bills?: OpenBill[];
  warning_flags?: { ceiling_80pct: boolean; calls_low: boolean };
}

export default function DueAmounts() {
  const { t } = useTranslation();
  const [data, setData] = useState<DuesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/dues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed");
        return;
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("DueAmounts fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePayDues = useCallback(async (billId?: string) => {
    if (!data || data.commission_due_bdt <= 0) return;
    setPaying(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        Alert.alert("Payment failed", "Not authenticated");
        return;
      }
      const body: Record<string, unknown> = {};
      if (billId) body.bill_id = billId;
      const res = await fetch(`${API_URL}/api/driver/dues/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.payment_url) {
        Alert.alert(
          "Payment failed",
          json.message || json.error || "Could not start payment",
        );
        return;
      }
      setPaymentURL(json.payment_url);
      setPaymentID(json.payment_event_id);
    } catch (err) {
      logger.error("DueAmounts pay failed", err);
      Alert.alert("Payment failed", "Network error");
    } finally {
      setPaying(false);
    }
  }, [data]);

  const handlePaymentSuccess = useCallback(() => {
    setPaymentURL(null);
    setPaymentID(null);
    fetchData(true);
  }, [fetchData]);

  const handlePaymentError = useCallback(
    (message: string) => {
      setPaymentURL(null);
      setPaymentID(null);
      Alert.alert("Payment not completed", message);
      fetchData(true);
    },
    [fetchData],
  );

  const stateLabel = (s: MonetizationState | undefined) => {
    switch (s) {
      case "NO_PRODUCT": return t('monetization.states.NO_PRODUCT');
      case "CEILING_LOCKED": return t('monetization.states.CEILING_LOCKED');
      case "LAPSED": return t('monetization.states.LAPSED');
      case "OWING": return t('monetization.states.OWING');
      case "PRODUCT_FROZEN": return t('monetization.states.PRODUCT_FROZEN');
      case "ACTIVE": return t('monetization.states.ACTIVE');
      default: return "-";
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
         testID="rider.due-amounts.el-1">
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          {t('monetization.pay_dues')}
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={{ marginTop: 40 }}
        />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Ionicons
            name="alert-circle-outline"
            size={40}
            color={colors.danger}
          />
          <Text
            className="text-[14px] font-Jakarta mt-3 text-center"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
          <TouchableOpacity onPress={() => fetchData()} className="mt-3" testID="rider.due-amounts.fetch-data">
            <Text
              className="text-[14px] font-JakartaBold"
              style={{ color: colors.primary }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : data ? (
        <ScrollView
          className="flex-1 px-[24px]"
          contentContainerStyle={{ paddingVertical: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => fetchData(true)}
              colors={[colors.primary]}
            />
          }
        >
          {/* ── Monetization state banner ── */}
          <View
            className="p-[16px] border rounded-[12px] mb-4 flex-row items-start"
            style={{
              backgroundColor: data.monetization_state === "ACTIVE"
                ? `${colors.success}14`
                : `${colors.amber}14`,
              borderColor: data.monetization_state === "ACTIVE"
                ? colors.success
                : colors.amber,
            }}
          >
            <Ionicons
              name={data.monetization_state === "ACTIVE" ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={data.monetization_state === "ACTIVE" ? colors.success : colors.amber}
            />
            <Text
              className="text-[13px] font-JakartaSemiBold ml-2 flex-1"
              style={{ color: data.monetization_state === "ACTIVE" ? colors.success : colors.amber }}
            >
              {stateLabel(data.monetization_state)}
            </Text>
          </View>

          {/* ── Ceiling warning ── */}
          {data.warning_flags?.ceiling_80pct && data.max_debt_limit_bdt != null && (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: `${colors.amber}14`, borderColor: colors.amber }}
            >
              <Text className="text-[13px] font-JakartaSemiBold mb-1" style={{ color: colors.amber }}>
                {t('monetization.ceiling_warn', { pct: 80 })}
              </Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                {t('monetization.max_debt_limit', { amount: formatBDT(data.max_debt_limit_bdt) })}
              </Text>
            </View>
          )}

          {/* ── Credit headroom ── */}
          {data.credit_headroom_paisa != null && data.credit_headroom_paisa > 0 && (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <Text className="text-[12px] font-JakartaSemiBold mb-1" style={{ color: textSecondary }}>
                {t('monetization.credit_headroom')}
              </Text>
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>
                {formatBDT(data.credit_headroom_paisa)}
              </Text>
              <Text className="text-[12px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                Before debt ceiling lockout
              </Text>
            </View>
          )}

          {/* ── Frozen subscription ── */}
          {data.frozen_subscription && (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: `${colors.amber}14`, borderColor: colors.amber }}
            >
              <Text className="text-[12px] font-JakartaSemiBold mb-1" style={{ color: colors.amber }}>
                Frozen Call Package
              </Text>
              <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
                {data.frozen_subscription.package_name ?? "Frozen Plan"}
              </Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  Calls remaining: {data.frozen_subscription.calls_remaining}
                </Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  Expires: {new Date(data.frozen_subscription.expires_at ?? 0).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </Text>
              </View>
              <Text className="text-[13px] font-Jakarta mt-2" style={{ color: textSecondary }}>
                Your calls are frozen. Switch to commission mode or settle dues to unfreeze.
              </Text>
            </View>
          )}

          {/* ── Subscription card ── */}
          {data.subscription ? (
            <View
              className="p-[16px] border rounded-[12px] mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <Text className="text-[12px] font-JakartaSemiBold mb-1" style={{ color: textSecondary }}>
                SUBSCRIPTION
              </Text>
              <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>
                {data.subscription.package_name ?? "Active Plan"}
              </Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  Calls remaining: {data.subscription.calls_remaining}
                </Text>
                <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }}>
                  Expires:{" "}
                  {new Date(data.subscription.expires_at ?? 0).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                </Text>
              </View>
              <View className="flex-row mt-2">
                <View className="rounded-full px-[10px] py-[2px]" style={{ backgroundColor: `${colors.primary}1A` }}>
                  <Text className="text-[11px] font-JakartaBold" style={{ color: colors.primary }}>
                    {data.subscription.status.toUpperCase()}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                className="rounded-full w-full py-[12px] items-center mt-3"
                style={{ backgroundColor: colors.primary }}
                onPress={() => router.push("/(main)/(rider)/packages")}
               testID="rider.due-amounts.push-packages">
                <Text className="text-[15px] font-JakartaBold text-white">
                  Renew
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[14px] font-Jakarta" style={{ color: textSecondary }}>No active subscription</Text>
              <TouchableOpacity className="rounded-full w-full py-[12px] items-center mt-3" style={{ backgroundColor: colors.primary }} onPress={() => router.push("/(main)/(rider)/packages")} testID="rider.due-amounts.push-packages-2">
                <Text className="text-[15px] font-JakartaBold text-white">Browse Packages</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Open bills (itemized) ── */}
          {(data.open_bills ?? []).length > 0 && (
            <View className="mb-4">
              <Text className="text-[12px] font-JakartaSemiBold mb-2" style={{ color: textSecondary }}>
                {t('monetization.open_bills')}
              </Text>
              {(data.open_bills ?? []).map((bill) => (
                <View key={bill.id} className="p-[16px] border rounded-[12px] mb-3" style={{ backgroundColor: surfaceBg, borderColor }}>
                  <View className="flex-row justify-between items-center">
                    <View>
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: textPrimary }}>
                        {formatBDT(bill.amount_bdt)}
                      </Text>
                      <Text className="text-[12px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                        Subscription bill{dueText(bill.due_at)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handlePayDues(bill.id)}
                      disabled={paying}
                      className="rounded-full px-[16px] py-[4px] items-center"
                      style={{ backgroundColor: colors.primary }}
                      testID="rider.due-amounts.handle-pay-dues">
                      <Text className="text-[12px] font-JakartaBold text-white">Pay</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── Commission due ── */}
          {data.commission_due_bdt > 0 && (
            <View className="p-[16px] border rounded-[12px] mb-4" style={{ backgroundColor: surfaceBg, borderColor }}>
              <Text className="text-[12px] font-JakartaSemiBold mb-1" style={{ color: textSecondary }}>
                COMMISSION DUE
              </Text>
              <Text className="text-[20px] font-JakartaBold" style={{ color: textPrimary }}>
                {formatBDT(data.commission_due_bdt)}
              </Text>
              <View className="flex-row mt-2">
                <View className="rounded-full px-[10px] py-[2px]" style={{ backgroundColor: `${colors.danger}1A` }}>
                  <Text className="text-[11px] font-JakartaBold" style={{ color: colors.danger }}>UNSETTLED</Text>
                </View>
              </View>
              <TouchableOpacity
                className="rounded-full w-full py-[12px] items-center mt-3"
                style={{ backgroundColor: colors.primary, opacity: paying ? 0.6 : 1 }}
                disabled={paying}
                onPress={() => handlePayDues()}
                testID="rider.due-amounts.handle-pay-dues-2">
                {paying ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text className="text-[15px] font-JakartaBold text-white">{t('monetization.pay_commission_dues')}</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* ── Lockout warning ── */}
          {data.is_dispatch_locked && (
            <View className="p-[16px] border rounded-[12px] mb-4 flex-row items-start" style={{ backgroundColor: `${colors.danger}14`, borderColor: colors.danger }}>
              <Ionicons name="lock-closed-outline" size={20} color={colors.danger} />
              <Text className="text-[13px] font-Jakarta ml-2 flex-1" style={{ color: colors.danger }}>
                Account locked for new rides: your unpaid commission has reached the {formatBDT(data.max_debt_limit_bdt ?? 0)} limit. Pay now to resume receiving ride offers.
              </Text>
            </View>
          )}

          {/* ── Total outstanding ── */}
          <View className="p-[16px] rounded-[12px]" style={{ backgroundColor: isDark ? colors.primaryLightDark : colors.primaryLight }}>
            <View className="flex-row justify-between items-center">
              <Text className="text-[14px] font-JakartaSemiBold" style={{ color: textPrimary }}>TOTAL OUTSTANDING</Text>
              <Text className="text-[20px] font-JakartaBold" style={{ color: colors.danger }}>{formatBDT(data.total_outstanding_bdt)}</Text>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {paymentURL && paymentID ? (
        <PaymentWebView paymentURL={paymentURL} paymentID={paymentID} purpose="commission_settlement" onSuccess={handlePaymentSuccess} onError={handlePaymentError} />
      ) : null}
    </SafeAreaView>
  );
}

function dueText(dueAt: string | null): string {
  if (!dueAt) return "";
  return ` · due ${new Date(dueAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`;
}
