/**
 * Delivery dues (Item 12) — the delivery operator's owed money, in ONE screen.
 *
 * Two receivable slots, exactly as GET /api/delivery/dues itemizes them:
 *   - PACKAGE BILL  (subscription_purchase) — the unpaid purchase bill for the
 *     delivery operator's current package, due-dated at the grant's expiry;
 *   - COMMISSION DUES (usage) — the aggregated platform fee accrued from
 *     delivered orders while a package rate governs (postpaid-gross: the
 *     delivery ledger keeps gross revenue, the fee is collected here).
 *
 * PAYMENT IS SEQUENTIAL — the rail settles one bill per payment event, so
 * "Pay all" walks the slots in order: package bill first, then commission.
 * Each success re-fetches the statement and only continues if something is
 * genuinely still open.
 *
 * Mirrors the shop-owner dues screen shape; data comes from
 * GET /api/delivery/dues and payment is POST /api/delivery/dues.
 *
 * Money is integer paisa; /100 happens only at render (formatBDT).
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

const MIN_PAYMENT_BDT = 1_000;

export default function DeliveryDuesScreen() {
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

  const load = useCallback(
    async (isRefresh = false): Promise<Statement | null> => {
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
        const res = await fetch(`${API_URL}/api/delivery/dues`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as Statement & { message?: string };
        if (!res.ok) {
          setError(json.message ?? t("delivery.dues.load_failed"));
          return null;
        }
        setStatement(json);
        return json;
      } catch (e) {
        logger.error("[delivery.dues] load failed", e);
        setError(t("delivery.dues.load_failed"));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

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
        const res = await fetch(`${API_URL}/api/delivery/dues`, {
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
          amount_bdt?: number;
        };
        if (!res.ok || !json.payment_url || !json.payment_event_id) {
          setQueue([]);
          Alert.alert(
            t("delivery.dues.payment_start_failed"),
            json.error === "payments_not_enabled"
              ? t("delivery.dues.payments_disabled")
              : json.message ?? json.error ?? "",
          );
          return;
        }
        setPaymentURL(json.payment_url);
        setPaymentID(json.payment_event_id);
      } catch (e) {
        logger.error("[delivery.dues] payment start failed", e);
        setQueue([]);
        Alert.alert(
          t("delivery.dues.payment_start_failed"),
          t("common.network_error"),
        );
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
      Alert.alert(
        t("delivery.dues.payment_failed"),
        message || t("delivery.dues.closed_by_user"),
      );
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
              ? t("delivery.dues.due_on", { date: formatDate(due) })
              : t("delivery.dues.no_due_date")
            : t("delivery.dues.payable_anytime")}
        </Text>
        {action}
      </View>
    );
  };

  const payPackageBill = useCallback(
    () => beginSequence(["subscription_purchase"]),
    [beginSequence],
  );
  const payCommissionDues = useCallback(
    () => beginSequence(["usage"]),
    [beginSequence],
  );

  const goToPackages = useCallback(() => {
    router.push("/(main)/(delivery-staff)/packages");
  }, []);

  const belowMinimum = (
    <Text className="text-[11px] mt-2" style={{ color: colors.amber }}>
      {t("delivery.dues.minimum_note")}
    </Text>
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={C.bg}
      />
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1"
         
         testID="delivery-staff.dues.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("delivery.dues.title")}
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
           
           testID="delivery-staff.dues.load">
            <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
              {t("delivery.dues.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (          <ScrollView
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
          {/* Monetization state banner — same shape as shop/fleet dues. */}
          <View
            className="mt-5 mb-4 rounded-2xl p-4"
            style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
          >
            <Text className="text-[12px] font-JakartaBold" style={{ color: C.sub }}>
              {t("delivery.dues.state.label")}
            </Text>
            <Text className="text-[22px] font-JakartaBold mt-1" style={{ color: bannerColor }}>
              {t(`delivery.dues.state.${stateKey}`)}
            </Text>
            {statement?.state === "ACTIVE" && statement?.active_package != null ? (
              <Text className="text-[13px] mt-2" style={{ color: C.sub }}>
                {t("delivery.dues.state.active_package", {
                  name: statement.active_package.name ?? t("common.unnamed"),
                })}
              </Text>
            ) : null}
          </View>

          {/* Receivable slots */}
          {renderSlot(
            "subscription_purchase",
            t("delivery.dues.package_bill"),
            t("delivery.dues.subscription_hint"),
            subscription,
            subscriptionPaisa,
            subscriptionPaisa >= MIN_PAYMENT_BDT ? (
              <TouchableOpacity
                className="mt-3 rounded-full py-2 items-center"
                style={{
                  backgroundColor: colors.primary,
                  opacity: starting === "subscription_purchase" ? 0.6 : 1,
                }}
                disabled={starting !== null}
                onPress={payPackageBill}
               
               testID="delivery-staff.dues.pay-package-bill">
                {starting === "subscription_purchase" ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text
                    className="text-[13px] font-JakartaBold"
                    style={{ color: colors.white }}
                  >
                    {t("delivery.dues.pay")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              belowMinimum
            ),
          )}
          {renderSlot(
            "usage",
            t("delivery.dues.commission_dues"),
            t("delivery.dues.commission_hint"),
            usage,
            usagePaisa,
            usagePaisa >= MIN_PAYMENT_BDT ? (
              <TouchableOpacity
                className="mt-3 rounded-full py-2 items-center"
                style={{ backgroundColor: colors.primary, opacity: starting === "usage" ? 0.6 : 1 }}
                disabled={starting !== null}
                onPress={payCommissionDues}
               
               testID="delivery-staff.dues.pay-commission-dues">
                {starting === "usage" ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text
                    className="text-[13px] font-JakartaBold"
                    style={{ color: colors.white }}
                  >
                    {t("delivery.dues.pay")}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              belowMinimum
            ),
          )}

          {/* Pay all */}
          {payableKinds.length >= 2 ? (
            <TouchableOpacity
              className="mt-5 rounded-2xl p-4"
              style={{ backgroundColor: colors.primary }}
              onPress={() => beginSequence(payableKinds)}
             
             testID="delivery-staff.dues.begin-sequence">
              <Text className="text-[15px] font-JakartaBold" style={{ color: colors.white }}>
                {t("delivery.dues.pay_all")}
              </Text>
              <Text className="text-[12px] mt-1" style={{ color: colors.white }}>
                {t("delivery.dues.pay_all_hint")}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* All clear */}
          {statement?.state === "ACTIVE" && payableKinds.length === 0 ? (
            <View
              className="mt-6 rounded-2xl p-4"
              style={{
                backgroundColor: colors.success,
                borderWidth: 1,
                borderColor: colors.success,
              }}
            >
              <Text className="text-[15px] font-JakartaBold text-center" style={{ color: colors.white }}>
                {t("delivery.dues.all_clear")}
              </Text>
              <TouchableOpacity
                className="mt-4 rounded-full px-5 py-2"
                style={{ backgroundColor: colors.white }}
                onPress={() => void goToPackages()}
               
               testID="delivery-staff.dues.go-to-packages">
                <Text className="text-[13px] font-JakartaBold" style={{ color: colors.primary }}>
                  {t("delivery.dues.go_to_packages")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* No product */}
          {statement?.state === "NO_PRODUCT" ? (
            <View
              className="mt-6 rounded-2xl p-4"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <Text className="text-[13px] font-JakartaBold" style={{ color: C.sub }}>
                {t("delivery.dues.hint_no_product")}
              </Text>
              <TouchableOpacity
                className="mt-4 rounded-full px-5 py-2"
                style={{ backgroundColor: colors.primary }}
                onPress={() => void goToPackages()}
               
               testID="delivery-staff.dues.go-to-packages-2">
                <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                  {t("delivery.dues.go_to_packages")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
      )}

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
