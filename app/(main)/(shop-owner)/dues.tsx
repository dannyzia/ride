/**
 * Shop dues (Batch-2 Item 7/8b) — the operator's owed money, in ONE screen.
 *
 * Two receivable slots, exactly as `GET /api/shop/dues` itemizes them:
 *   - PACKAGE BILL  (`subscription_purchase`) — the unpaid purchase bill for the
 *     shop's current package, due-dated at the grant's expiry;
 *   - COMMISSION DUES (`usage`) — the aggregated platform fee accrued from
 *     delivered orders while a package rate governs (postpaid-gross: the shop
 *     ledger keeps gross revenue, the fee is collected here).
 *
 * PAYMENT IS SEQUENTIAL — the rail settles one bill per payment event (the
 * usage slot is settled as a set, so it stays one invoice), so "Pay all" walks
 * the slots in order: package bill first, then commission. Each success
 * re-fetches the statement and only continues if something is genuinely still
 * open, so an abandoned payment ends the sequence instead of re-invoicing.
 *
 * Money is integer paisa; /100 happens only at render (`formatBDT`).
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT, formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import * as Crypto from "expo-crypto";
import PaymentWebView from "@/components/PaymentWebView";

type BillKind = "subscription_purchase" | "usage";
type DuesState = "NO_PRODUCT" | "LAPSED" | "OWING" | "ACTIVE";

interface OpenBill {
  id: string;
  kind: string;
  amount_bdt: number;
  due_at: string | null;
  created_at: string;
}

interface Statement {
  state: DuesState;
  total_unpaid_paisa: number;
  unpaid_subscription_paisa: number;
  net_commission_paisa: number;
  debt_ceiling_paisa: number;
  credit_headroom_paisa: number;
  open_subscription_bills: OpenBill[];
  open_usage_bills: OpenBill[];
  active_package: {
    package_id: string;
    name: string | null;
    started_at: string;
    expires_at: string | null;
  } | null;
}

/** ৳10 — the gateway minimum (M-09); a smaller bill cannot be invoiced. */
const MIN_PAYMENT_BDT = 1_000;

export default function ShopDuesScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [queue, setQueue] = useState<BillKind[]>([]);
  const [starting, setStarting] = useState<BillKind | null>(null);
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false): Promise<Statement | null> => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        router.back();
        return null;
      }
      const res = await fetch(`${API_URL}/api/shop/dues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as Statement & { message?: string };
      if (!res.ok) {
        setError(json.message ?? t("shop.dues.load_failed"));
        return null;
      }
      setStatement(json);
      return json;
    } catch (e) {
      logger.error("[shop.dues] load failed", e);
      setError(t("shop.dues.load_failed"));
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const startPayment = useCallback(
    async (kind: BillKind) => {
      setStarting(kind);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          router.back();
          return;
        }
        const res = await fetch(`${API_URL}/api/shop/dues`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": Crypto.randomUUID(),
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ bill_kind: kind }),
        });
        const json = (await res.json()) as {
          payment_url?: string;
          payment_event_id?: string;
          message?: string;
          error?: string;
        };
        if (!res.ok || !json.payment_url || !json.payment_event_id) {
          setQueue([]);
          Alert.alert(
            t("shop.dues.payment_start_failed"),
            json.error === "payments_not_enabled"
              ? t("shop.dues.payments_disabled")
              : (json.message ?? json.error ?? ""),
          );
          return;
        }
        setPaymentURL(json.payment_url);
        setPaymentID(json.payment_event_id);
      } catch (e) {
        logger.error("[shop.dues] payment start failed", e);
        setQueue([]);
        Alert.alert(t("shop.dues.payment_start_failed"), t("common.network_error"));
      } finally {
        setStarting(null);
      }
    },
    [t],
  );

  const beginSequence = useCallback(
    (kinds: BillKind[]) => {
      if (kinds.length === 0) return;
      setQueue(kinds);
      void startPayment(kinds[0]);
    },
    [startPayment],
  );

  const handlePaymentSuccess = useCallback(async () => {
    setPaymentURL(null);
    setPaymentID(null);
    const remaining = queue.slice(1);
    setQueue(remaining);
    const fresh = await load(true);
    if (!fresh || remaining.length === 0) {
      setQueue([]);
      return;
    }
    // Only continue if the next slot is genuinely still open (a failed or
    // abandoned payment must not silently re-invoice the same bill).
    const nextKind = remaining[0];
    const stillOpen =
      nextKind === "subscription_purchase"
        ? fresh.open_subscription_bills.length > 0
        : fresh.open_usage_bills.length > 0;
    if (stillOpen) void startPayment(nextKind);
    else setQueue([]);
  }, [queue, load, startPayment]);

  const handlePaymentError = useCallback(
    (message: string) => {
      setPaymentURL(null);
      setPaymentID(null);
      setQueue([]);
      Alert.alert(t("shop.dues.payment_failed"), message || t("shop.dues.closed_by_user"));
      void load(true);
    },
    [load, t],
  );

  const subscription = statement?.open_subscription_bills ?? [];
  const usage = statement?.open_usage_bills ?? [];
  const subscriptionPaisa = statement?.unpaid_subscription_paisa ?? 0;
  const usagePaisa = statement?.net_commission_paisa ?? 0;
  const payableKinds: BillKind[] = [
    ...(subscriptionPaisa >= MIN_PAYMENT_BDT ? (["subscription_purchase"] as BillKind[]) : []),
    ...(usagePaisa >= MIN_PAYMENT_BDT ? (["usage"] as BillKind[]) : []),
  ];

  const stateKey = (statement?.state ?? "NO_PRODUCT").toLowerCase();
  const bannerColor =
    statement?.state === "OWING"
      ? colors.amber
      : statement?.state === "ACTIVE"
        ? colors.success
        : colors.danger;

  /** Card shell for one receivable slot; the action is built per slot so each
   * button carries its own handler (and therefore its own testID). */
  const renderSlot = (
    kind: BillKind,
    title: string,
    hint: string,
    bills: OpenBill[],
    paisa: number,
    action: ReactNode,
  ) => {
    if (paisa <= 0 && bills.length === 0) return null;
    const due = bills.find((b) => b.due_at)?.due_at ?? null;
    return (
      <View
        key={kind}
        className="rounded-2xl p-4 mb-3"
        style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
      >
        <Text className="text-[12px] font-JakartaBold" style={{ color: C.sub }}>
          {title}
        </Text>
        <Text className="text-[22px] font-JakartaBold mt-1" style={{ color: C.text }}>
          {formatBDT(paisa)}
        </Text>
        <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
          {hint}
        </Text>
        <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
          {kind === "subscription_purchase"
            ? due
              ? t("shop.dues.due_on", { date: formatDate(due) })
              : t("shop.dues.no_due_date")
            : t("shop.dues.payable_anytime")}
        </Text>
        {action}
      </View>
    );
  };

  const payPackageBill = useCallback(
    () => beginSequence(["subscription_purchase"]),
    [beginSequence],
  );
  const payCommissionDues = useCallback(() => beginSequence(["usage"]), [beginSequence]);

  const belowMinimum = (
    <Text className="text-[11px] mt-2" style={{ color: colors.amber }}>
      {t("shop.dues.minimum_note")}
    </Text>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1"
         
         testID="shop-owner.dues.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.dues.title")}
        </Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : error ? (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="alert-circle-outline" size={40} color={colors.danger} />
          <Text className="text-[13px] text-center mt-3" style={{ color: colors.danger }}>
            {error}
          </Text>
          <TouchableOpacity
            className="mt-4 rounded-full px-5 py-2"
            style={{ backgroundColor: colors.primary }}
            onPress={() => void load()}
           
           testID="shop-owner.dues.load">
            <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
              {t("shop.dues.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : statement ? (
        <ScrollView
          contentContainerStyle={{ padding: 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {/* State banner — NO_PRODUCT > LAPSED > OWING > ACTIVE (server) */}
          <View
            className="rounded-2xl p-4 mb-4 flex-row items-start"
            style={{
              backgroundColor: `${bannerColor}14`,
              borderWidth: 1,
              borderColor: bannerColor,
            }}
          >
            <Ionicons
              name={statement.state === "ACTIVE" ? "checkmark-circle" : "alert-circle"}
              size={20}
              color={bannerColor}
            />
            <View className="flex-1 ml-2">
              <Text className="text-[13px] font-JakartaSemiBold" style={{ color: bannerColor }}>
                {t(`monetization.states.${stateKey}`)}
              </Text>
              <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                {t(`shop.dues.hint_${stateKey}`)}
              </Text>
            </View>
          </View>

          {/* Total owed + split + headroom */}
          <View
            className="rounded-2xl p-4 mb-4"
            style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
          >
            <Text className="text-[12px] font-JakartaBold" style={{ color: C.sub }}>
              {t("shop.dues.total_unpaid")}
            </Text>
            <Text
              className="text-[28px] font-JakartaBold mt-1"
              style={{ color: statement.total_unpaid_paisa > 0 ? colors.danger : C.text }}
            >
              {formatBDT(statement.total_unpaid_paisa)}
            </Text>
            <View className="flex-row justify-between mt-3">
              <Text className="text-[11px]" style={{ color: C.sub }}>
                {t("shop.dues.package_bill")} · {formatBDT(subscriptionPaisa)}
              </Text>
              <Text className="text-[11px]" style={{ color: C.sub }}>
                {t("shop.dues.commission_dues")} · {formatBDT(usagePaisa)}
              </Text>
            </View>
            <View className="flex-row justify-between mt-1">
              <Text className="text-[11px]" style={{ color: C.sub }}>
                {t("shop.dues.credit_headroom")}
              </Text>
              <Text className="text-[11px] font-JakartaSemiBold" style={{ color: C.text }}>
                {formatBDT(statement.credit_headroom_paisa)}
              </Text>
            </View>
          </View>

          {/* The two receivable slots */}
          {renderSlot(
            "subscription_purchase",
            t("shop.dues.package_bill"),
            t("shop.dues.package_bill_hint"),
            subscription,
            subscriptionPaisa,
            subscriptionPaisa >= MIN_PAYMENT_BDT ? (
              <TouchableOpacity
                className="rounded-full py-2 items-center mt-3"
                style={{
                  backgroundColor: colors.primary,
                  opacity: starting === "subscription_purchase" ? 0.6 : 1,
                }}
                disabled={starting !== null}
                onPress={payPackageBill}
               testID="shop-owner.dues.pay-package-bill">
                {starting === "subscription_purchase" ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text
                    className="text-[14px] font-JakartaBold"
                    style={{ color: colors.white }}
                  >
                    {t("shop.dues.pay")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              belowMinimum
            ),
          )}
          {renderSlot(
            "usage",
            t("shop.dues.commission_dues"),
            t("shop.dues.commission_hint"),
            usage,
            usagePaisa,
            usagePaisa >= MIN_PAYMENT_BDT ? (
              <TouchableOpacity
                className="rounded-full py-2 items-center mt-3"
                style={{ backgroundColor: colors.primary, opacity: starting === "usage" ? 0.6 : 1 }}
                disabled={starting !== null}
                onPress={payCommissionDues}
               testID="shop-owner.dues.pay-commission-dues">
                {starting === "usage" ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text
                    className="text-[14px] font-JakartaBold"
                    style={{ color: colors.white }}
                  >
                    {t("shop.dues.pay")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              belowMinimum
            ),
          )}

          {/* Pay all — strictly in sequence, one invoice per slot */}
          {payableKinds.length > 1 ? (
            <TouchableOpacity
              className="rounded-full py-3 items-center mb-2"
              style={{ backgroundColor: colors.primary }}
              disabled={starting !== null}
              onPress={() => beginSequence(payableKinds)}
             
             testID="shop-owner.dues.begin-sequence">
              <Text className="text-[15px] font-JakartaBold" style={{ color: colors.white }}>
                {t("shop.dues.pay_all")}
              </Text>
            </TouchableOpacity>
          ) : null}
          {payableKinds.length > 1 ? (
            <Text className="text-[11px] text-center mb-4" style={{ color: C.sub }}>
              {t("shop.dues.pay_all_hint")}
            </Text>
          ) : null}

          {statement.total_unpaid_paisa === 0 ? (
            <View
              className="rounded-2xl p-4 mb-4 flex-row items-center"
              style={{ backgroundColor: `${colors.success}14`, borderWidth: 1, borderColor: colors.success }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.success} />
              <Text className="text-[12px] ml-2 flex-1" style={{ color: colors.success }}>
                {t("shop.dues.all_clear")}
              </Text>
            </View>
          ) : null}

          {/* Active possession (what the package bill is for) */}
          {statement.active_package ? (
            <View
              className="rounded-2xl p-4"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <Text className="text-[12px] font-JakartaBold" style={{ color: C.sub }}>
                {t("shop.dues.active_package")}
              </Text>
              <Text className="text-[15px] font-JakartaBold mt-1" style={{ color: C.text }}>
                {statement.active_package.name ?? t("shop.dues.package_fallback")}
              </Text>
              <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                {statement.active_package.expires_at
                  ? t("shop.dues.expires_on", {
                      date: formatDate(statement.active_package.expires_at),
                    })
                  : t("shop.dues.no_expiry")}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {paymentURL && paymentID ? (
        <PaymentWebView
          paymentURL={paymentURL}
          paymentID={paymentID}
          purpose="subscription_settlement"
          onSuccess={() => void handlePaymentSuccess()}
          onError={handlePaymentError}
        />
      ) : null}
    </SafeAreaView>
  );
}
