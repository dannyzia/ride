/**
 * Shop packages (Batch-2 Item 11) — buy a shop package on the postpaid rail.
 *
 * Data comes from `GET /api/shop/packages` (Item 6 visibility: live rows whose
 * applicable_roles contains 'shop' — shop-only plans and plans shared with
 * other roles, never driver-only). Purchase is `POST /api/shop/packages/
 * purchase`: a success GRANTS the possession and opens the purchase bill on
 * `operator_bills` (postpaid — `payment_url` is null by design; the bill is
 * settled through the dues screen). The activation banner reuses the dues
 * screen's PaymentWebView flow for the immediate-pay path.
 *
 * Typed 409s from the purchase rail map to client surfaces:
 *   - dues_outstanding_purchase_blocked → client-only PURCHASE_BLOCKED banner
 *     (the total_unpaid_paisa figure rides in the error details);
 *   - active_package_exists → prompt to settle the open bill on dues;
 *   - package_not_applicable_to_role → the server message.
 *
 * Statement lifecycle (OQ1 — pull is canonical): fetch on focus and after the
 * purchase / payment returns; no WebSocket dependency.
 *
 * Money is integer paisa; /100 happens only at render (`formatBDT`). Commercial
 * copy never uses the word "free" — a ৳0 package is "nothing owed".
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
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT, formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import PaymentWebView from "@/components/PaymentWebView";

interface ShopPackage {
  id: string;
  name: string;
  product_type: string;
  call_count: number;
  duration_days: number | null;
  price_bdt: number;
  daily_cap: number | null;
  is_trial: boolean;
  commission_percent: number | null;
  applicable_roles: string[] | null;
}

interface PurchaseSuccess {
  bill: { id: string; amount_bdt: number; due_at: string | null } | null;
  grantExpiresAt: string | null;
}

/** ৳10 — the gateway minimum (M-09); a smaller bill cannot be invoiced. */
const MIN_PAYMENT_BDT = 1_000;

export default function ShopPackagesScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [packages, setPackages] = useState<ShopPackage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  // Post-purchase activation banner (bill = the open purchase bill, null for ৳0).
  const [activated, setActivated] = useState<PurchaseSuccess | null>(null);
  // Client-only PURCHASE_BLOCKED: a purchase attempt hit the typed 409.
  const [blockedTotal, setBlockedTotal] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false): Promise<ShopPackage[] | null> => {
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
        const res = await fetch(`${API_URL}/api/shop/packages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          packages?: ShopPackage[];
          message?: string;
        };
        if (!res.ok) {
          setError(json.message ?? t("shop.packages.load_failed"));
          return null;
        }
        setPackages(json.packages ?? []);
        return json.packages ?? [];
      } catch (e) {
        logger.error("[shop.packages] load failed", e);
        setError(t("shop.packages.load_failed"));
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  // OQ1 lifecycle: fetch on focus (the statement lifecycle for this surface).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = useCallback(
    async (pkg: ShopPackage) => {
      setBuyingId(pkg.id);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          router.back();
          return;
        }
        const res = await fetch(`${API_URL}/api/shop/packages/purchase`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ package_id: pkg.id }),
        });
        const json = (await res.json()) as {
          activated?: boolean;
          bill?: PurchaseSuccess["bill"];
          grant?: { expires_at?: string | null };
          error?: string;
          message?: string;
          total_unpaid_paisa?: number;
        };
        if (res.ok && json.activated) {
          setBlockedTotal(null);
          setActivated({
            bill: json.bill ?? null,
            grantExpiresAt: json.grant?.expires_at ?? null,
          });
          // OQ1: refresh after the purchase returns.
          await load(true);
          return;
        }
        switch (json.error) {
          case "dues_outstanding_purchase_blocked":
            // Client-only PURCHASE_BLOCKED banner; the figure rides along.
            setBlockedTotal(
              typeof json.total_unpaid_paisa === "number" ? json.total_unpaid_paisa : 0,
            );
            break;
          case "active_package_exists":
            Alert.alert(t("shop.packages.already_open_title"), t("shop.packages.already_open_body"), [
              { text: t("shop.packages.go_to_dues"), onPress: () => router.push("/(main)/(shop-owner)/dues") },
              { text: t("common.cancel") },
            ]);
            break;
          default:
            Alert.alert(
              t("shop.packages.purchase_failed"),
              json.message ?? json.error ?? "",
            );
            break;
        }
      } catch (e) {
        logger.error("[shop.packages] purchase failed", e);
        Alert.alert(t("shop.packages.purchase_failed"), t("common.network_error"));
      } finally {
        setBuyingId(null);
      }
    },
    [load, t],
  );

  // Immediate pay: same dues flow as the dues screen (subscription_purchase
  // slot, then PaymentWebView). The bill is already open — this only invoices it.
  const payNow = useCallback(async () => {
    setPaying(true);
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
          "Idempotency-Key": crypto.randomUUID(),
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bill_kind: "subscription_purchase" }),
      });
      const json = (await res.json()) as {
        payment_url?: string;
        payment_event_id?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !json.payment_url || !json.payment_event_id) {
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
      logger.error("[shop.packages] pay now failed", e);
      Alert.alert(t("shop.dues.payment_start_failed"), t("common.network_error"));
    } finally {
      setPaying(false);
    }
  }, [t]);

  const handlePaymentSuccess = useCallback(async () => {
    setPaymentURL(null);
    setPaymentID(null);
    // OQ1: refresh after the payment returns.
    await load(true);
  }, [load]);

  const handlePaymentError = useCallback(
    (message: string) => {
      setPaymentURL(null);
      setPaymentID(null);
      Alert.alert(t("shop.dues.payment_failed"), message || t("shop.dues.closed_by_user"));
      void load(true);
    },
    [load, t],
  );

  const goToDues = useCallback(() => {
    router.push("/(main)/(shop-owner)/dues");
  }, []);

  const activatedBody: ReactNode = activated
    ? activated.bill
      ? t("shop.packages.activated_bill", { amount: formatBDT(activated.bill.amount_bdt) })
      : t("shop.packages.activated_no_bill")
    : null;

  const canPayNow =
    activated?.bill != null && activated.bill.amount_bdt >= MIN_PAYMENT_BDT;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={C.bg} />
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity onPress={() => router.back()} className="p-1" testID="shop-owner.packages.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.packages.title")}
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
           testID="shop-owner.packages.load">
            <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
              {t("shop.packages.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
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
          {/* Client-only PURCHASE_BLOCKED — a purchase attempt hit the typed 409 */}
          {blockedTotal !== null ? (
            <View
              className="rounded-2xl p-4 mb-4"
              style={{
                backgroundColor: `${colors.amber}14`,
                borderWidth: 1,
                borderColor: colors.amber,
              }}
            >
              <View className="flex-row items-start">
                <Ionicons name="alert-circle" size={20} color={colors.amber} />
                <View className="flex-1 ml-2">
                  <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.amber }}>
                    {t("shop.packages.blocked_title")}
                  </Text>
                  <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                    {t("shop.packages.blocked_body", { amount: formatBDT(blockedTotal) })}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                className="rounded-full py-2 items-center mt-3"
                style={{ backgroundColor: colors.primary }}
                onPress={goToDues}
               testID="shop-owner.packages.go-to-dues">
                <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                  {t("shop.packages.go_to_dues")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Activation — the bill is open; pay now or later (dues flow) */}
          {activated ? (
            <View
              className="rounded-2xl p-4 mb-4"
              style={{
                backgroundColor: `${colors.success}14`,
                borderWidth: 1,
                borderColor: colors.success,
              }}
            >
              <View className="flex-row items-start">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <View className="flex-1 ml-2">
                  <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.success }}>
                    {t("shop.packages.activated_title")}
                  </Text>
                  <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                    {activatedBody}
                  </Text>
                  {activated.grantExpiresAt ? (
                    <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                      {t("shop.packages.expires_on", { date: formatDate(activated.grantExpiresAt) })}
                    </Text>
                  ) : null}
                </View>
              </View>
              {activated.bill ? (
                canPayNow ? (
                  <View className="flex-row gap-2 mt-3">
                    <TouchableOpacity
                      className="flex-1 rounded-full py-2 items-center"
                      style={{ backgroundColor: colors.primary, opacity: paying ? 0.6 : 1 }}
                      disabled={paying}
                      onPress={() => void payNow()}
                     testID="shop-owner.packages.pay-now">
                      {paying ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                          {t("shop.packages.pay_now")}
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-full py-2 items-center"
                      style={{ borderWidth: 1, borderColor: C.border }}
                      onPress={() => setActivated(null)}
                     testID="shop-owner.packages.set-activated">
                      <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                        {t("shop.packages.pay_later")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <Text className="text-[11px] mt-3" style={{ color: colors.amber }}>
                      {t("shop.packages.minimum_note")}
                    </Text>
                    <TouchableOpacity
                      className="rounded-full py-2 items-center mt-3"
                      style={{ borderWidth: 1, borderColor: C.border }}
                      onPress={() => setActivated(null)}
                     testID="shop-owner.packages.set-activated-2">
                      <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                        {t("shop.packages.pay_later")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )
              ) : null}
            </View>
          ) : null}

          {packages && packages.length === 0 ? (
            <View className="items-center py-12 px-6">
              <Ionicons name="cube-outline" size={40} color={C.sub} />
              <Text className="text-[15px] font-JakartaBold mt-3" style={{ color: C.text }}>
                {t("shop.packages.empty_title")}
              </Text>
              <Text className="text-[12px] text-center mt-2" style={{ color: C.sub }}>
                {t("shop.packages.empty_body")}
              </Text>
            </View>
          ) : (
            (packages ?? []).map((pkg) => (
              <View
                key={pkg.id}
                className="rounded-2xl p-4 mb-3"
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-[15px] font-JakartaBold" style={{ color: C.text }}>
                      {pkg.name}
                    </Text>
                    <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                      {pkg.duration_days
                        ? t("shop.packages.plan_days", { days: pkg.duration_days })
                        : t("shop.packages.plan_no_expiry")}
                      {" · "}
                      {t("shop.packages.plan_commission", {
                        pct: pkg.commission_percent ?? 0,
                      })}
                    </Text>
                  </View>
                  <Text className="text-[17px] font-JakartaBold" style={{ color: C.text }}>
                    {formatBDT(pkg.price_bdt)}
                  </Text>
                </View>
                <TouchableOpacity
                  className="rounded-full py-2 items-center mt-3"
                  style={{ backgroundColor: colors.primary, opacity: buyingId === pkg.id ? 0.6 : 1 }}
                  disabled={buyingId !== null}
                  onPress={() => void purchase(pkg)}
                 testID="shop-owner.packages.purchase">
                  {buyingId === pkg.id ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                      {t("shop.packages.buy")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
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
