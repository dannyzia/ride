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
import { formatBDT } from "@/lib/format";
import { logger } from "@/lib/logger";
import * as Crypto from "expo-crypto";
import PaymentWebView from "@/components/PaymentWebView";

interface DeliveryPackage {
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

const MIN_PAYMENT_BDT = 1_000;

export default function DeliveryPackagesScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [packages, setPackages] = useState<DeliveryPackage[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [activated, setActivated] = useState<PurchaseSuccess | null>(null);
  const [blockedTotal, setBlockedTotal] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [paymentURL, setPaymentURL] = useState<string | null>(null);
  const [paymentID, setPaymentID] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
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
          return;
        }
        const res = await fetch(`${API_URL}/api/delivery/packages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          packages?: DeliveryPackage[];
          message?: string;
          error?: string;
        };
        if (!res.ok) {
          setError(json.message ?? json.error ?? t("delivery.packages.load_failed"));
          return;
        }
        setPackages(json.packages ?? []);
      } catch (e) {
        logger.error("[delivery.packages] load failed", e);
        setError(t("delivery.packages.load_failed"));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [t],
  );

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    void load();
  }, [load]);

  const purchase = useCallback(
    async (pkg: DeliveryPackage) => {
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
        const res = await fetch(`${API_URL}/api/delivery/packages/purchase`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": Crypto.randomUUID(),
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
          await load(true);
          return;
        }
        switch (json.error) {
          case "dues_outstanding_purchase_blocked":
            setBlockedTotal(
              typeof json.total_unpaid_paisa === "number" ? json.total_unpaid_paisa : 0,
            );
            break;
          case "active_package_exists":
            Alert.alert(
              t("delivery.packages.already_open_title"),
              t("delivery.packages.already_open_body"),
              [
                {
                  text: t("delivery.packages.go_to_dues"),
                  onPress: () => router.push("/(main)/(delivery-staff)/dues"),
                },
                { text: t("common.cancel") },
              ],
            );
            break;
          default:
            Alert.alert(
              t("delivery.packages.purchase_failed"),
              json.message ?? json.error ?? "",
            );
            break;
        }
      } catch (e) {
        logger.error("[delivery.packages] purchase failed", e);
        Alert.alert(
          t("delivery.packages.purchase_failed"),
          t("common.network_error"),
        );
      } finally {
        setBuyingId(null);
      }
    },
    [load, t],
  );

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
      const res = await fetch(`${API_URL}/api/delivery/dues`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": Crypto.randomUUID(),
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
        setPaying(false);
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
      setPaying(false);
      logger.error("[delivery.packages] pay now failed", e);
      Alert.alert(
        t("delivery.dues.payment_start_failed"),
        t("common.network_error"),
      );
    }
  }, [t]);

  const handlePaymentSuccess = useCallback(async () => {
    setPaymentURL(null);
    setPaymentID(null);
    await load(true);
  }, [load]);

  const handlePaymentError = useCallback(
    (message: string) => {
      setPaymentURL(null);
      setPaymentID(null);
      Alert.alert(
        t("delivery.dues.payment_failed"),
        message || t("delivery.dues.closed_by_user"),
      );
      void load(true);
    },
    [load, t],
  );

  const goToDues = useCallback(() => {
    router.push("/(main)/(delivery-staff)/dues");
  }, []);

  const activatedBody: ReactNode = activated
    ? activated.bill
      ? t("delivery.packages.activated_bill", {
          amount: formatBDT(activated.bill.amount_bdt),
        })
      : t("delivery.packages.activated_no_bill")
    : null;

  const canPayNow =
    activated?.bill != null && activated.bill.amount_bdt >= MIN_PAYMENT_BDT;

  const payNowRow: ReactNode = canPayNow ? (
    <View className="flex-row gap-2 mt-4">
      <TouchableOpacity
        className="flex-1 rounded-full py-2 items-center"
        style={{ backgroundColor: colors.white, opacity: paying ? 0.6 : 1 }}
        disabled={paying}
        onPress={() => void payNow()}
       
       testID="delivery-staff.packages.pay-now">
        {paying ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Text className="text-[13px] font-JakartaBold" style={{ color: colors.primary }}>
            {t("delivery.packages.pay_now")}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        className="flex-1 rounded-full py-2 items-center"
        style={{ borderWidth: 1, borderColor: C.border }}
        onPress={() => setActivated(null)}
       
       testID="delivery-staff.packages.set-activated">
        <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
          {t("delivery.packages.pay_later")}
        </Text>
      </TouchableOpacity>
    </View>
  ) : (
    <>
      <Text className="text-[11px] mt-3" style={{ color: colors.amber }}>
        {t("delivery.packages.minimum_note")}
      </Text>
      <TouchableOpacity
        className="rounded-full py-2 items-center mt-3"
        style={{ borderWidth: 1, borderColor: C.border }}
        onPress={() => setActivated(null)}
       
       testID="delivery-staff.packages.set-activated-2">
        <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
          {t("delivery.packages.pay_later")}
        </Text>
      </TouchableOpacity>
    </>
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
         
         testID="delivery-staff.packages.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("delivery.packages.title")}
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
           
           testID="delivery-staff.packages.load">
            <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
              {t("delivery.packages.retry")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 0, flexGrow: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        >
          {packages == null || packages.length === 0 ? (
            <View className="flex-1 items-center justify-center px-6">
              <Ionicons name="cart-outline" size={48} color={C.sub} />
              <Text className="text-[15px] text-center mt-4" style={{ color: C.text }}>
                {t("delivery.packages.empty_title")}
              </Text>
              <Text className="text-[13px] text-center mt-2" style={{ color: C.sub }}>
                {t("delivery.packages.empty_body")}
              </Text>
            </View>
          ) : (
            <View className="mt-4 space-y-4">
              {packages.map((pkg) => {
                const buying = buyingId === pkg.id;
                return (
                  <View
                    key={pkg.id}
                    className="rounded-2xl p-4"
                    style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
                  >
                    <View className="flex-row items-start justify-between">
                      <View>
                        <Text className="text-[15px] font-JakartaBold" style={{ color: C.text }}>
                          {pkg.name}
                        </Text>
                        <Text className="text-[12px] mt-1" style={{ color: C.sub }}>
                          {t(
                            `delivery.packages.${
                              pkg.duration_days != null ? "plan_days" : "plan_no_expiry"
                            }`,
                            { days: pkg.duration_days },
                          )}
                        </Text>
                        {pkg.commission_percent != null ? (
                          <Text className="text-[12px] mt-1" style={{ color: C.sub }}>
                            {t("delivery.packages.plan_commission", {
                              pct: pkg.commission_percent,
                            })}
                          </Text>
                        ) : null}
                      </View>
                      <Text className="text-[20px] font-JakartaBold" style={{ color: C.text }}>
                        {formatBDT(pkg.price_bdt)}
                      </Text>
                    </View>
                    {buying ? (
                      <ActivityIndicator className="mt-4" color={colors.white} />
                    ) : (
                      <TouchableOpacity
                        className="mt-4 rounded-full py-2 items-center"
                        style={{ backgroundColor: colors.primary, opacity: buying ? 0.6 : 1 }}
                        disabled={buyingId !== null}
                        onPress={() => void purchase(pkg)}
                       
                       testID="delivery-staff.packages.purchase">
                        {buying ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                            {t("delivery.packages.buy")}
                          </Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Activation banner */}
          {activated ? (
            <View
              className="mt-6 rounded-2xl p-4"
              style={{
                backgroundColor: colors.success,
                borderWidth: 1,
                borderColor: colors.success,
              }}
            >
              <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                {t("delivery.packages.activated_title")}
              </Text>
              <Text className="text-[14px] mt-2" style={{ color: colors.white }}>
                {activatedBody}
              </Text>
              {payNowRow}
              <TouchableOpacity
                className="mt-3 rounded-full py-2 items-center"
                style={{ backgroundColor: colors.white }}
                onPress={() => void goToDues()}
               
               testID="delivery-staff.packages.go-to-dues">
                <Text className="text-[13px] font-JakartaBold" style={{ color: colors.primary }}>
                  {t("delivery.packages.go_to_dues")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Purchase-blocked banner */}
          {blockedTotal != null ? (
            <View
              className="mt-6 rounded-2xl p-4"
              style={{
                backgroundColor: colors.amber,
                borderWidth: 1,
                borderColor: colors.amber,
              }}
            >
              <Text className="text-[13px] font-JakartaBold" style={{ color: colors.white }}>
                {t("delivery.packages.blocked_title")}
              </Text>
              <Text className="text-[14px] mt-2" style={{ color: colors.white }}>
                {t("delivery.packages.blocked_body", {
                  amount: formatBDT(blockedTotal),
                })}
              </Text>
              <TouchableOpacity
                className="mt-4 rounded-full py-2 items-center"
                style={{ borderWidth: 1, borderColor: C.border }}
                onPress={() => void goToDues()}
               
               testID="delivery-staff.packages.go-to-dues-2">
                <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                  {t("delivery.packages.go_to_dues")}
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
