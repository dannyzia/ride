/**
 * Customer order tracking (F-11 — plan 27 §5, USER-FLOWS F-11).
 *
 * State timeline, courier-assignment panel (the placement-created `deliveries`
 * leg), out-of-stock partial confirm, state-dependent customer cancel (fee is
 * config-fresh, computed server-side — this screen never reads config), and
 * the F-38 dispute link into report-issue. The detail GET is the single
 * source of truth for `cancellable` / `cancel_fee_bdt`.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { formatBDT } from "@/lib/format";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrderRow {
  id: string;
  shop_id: string;
  status: string;
  order_kind: string;
  fulfillment: string;
  subtotal_bdt: number;
  delivery_fee_bdt: number | null;
  total_bdt: number;
  delivery_address: string | null;
  prep_minutes: number | null;
  accepted_at: string | null;
  prepared_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  cancel_fee_bdt: number | null;
  unavailable_item_ids: string[] | null;
  partial_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ItemRow {
  id: string;
  product_id: string;
  quantity: number;
  line_total_bdt: number;
  product_name: string | null;
}

interface LegRow {
  status: string;
  delivery_man_user_id: string | null;
  accepted_at: string | null;
  delivery_fee_bdt: number;
}

interface DetailResponse {
  order: OrderRow;
  items: ItemRow[];
  shop_name: string | null;
  leg: LegRow | null;
  cancellable: boolean;
  cancel_fee_bdt: number | null;
}

const TERMINAL_STATUSES = ["delivered", "self_delivered", "cancelled", "refunded"];

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [acting, setActing] = useState(false);
  const mounted = useRef(true);

  const fetchData = useCallback(async (silent = false) => {
    if (!id || !UUID_RE.test(id)) {
      setError(true);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(true);
        return;
      }
      const res = await fetch(`${SERVER_URL}/api/shop/orders/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: DetailResponse = await res.json();
      if (mounted.current) {
        setData(body);
        setError(false);
      }
    } catch (err) {
      logger.error("[order-tracking] fetch error", err);
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    fetchData();
    return () => {
      mounted.current = false;
    };
  }, [fetchData]);

  // F-11 "notified" edges: poll while the order is live (15s), stop on
  // terminal states — cheap idle cost, fresh timeline during the flow.
  useEffect(() => {
    const status = data?.order.status;
    if (!status || TERMINAL_STATUSES.includes(status)) return;
    const timer = setInterval(() => fetchData(true), 15000);
    return () => clearInterval(timer);
  }, [data?.order.status, fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  };

  const order = data?.order;
  const leg = data?.leg ?? null;
  const isService = order?.order_kind === "service_booking";
  const isDelivery = order?.fulfillment === "delivery";
  const isCancelled = order?.status === "cancelled";

  // ── Timeline steps (F-11 canonical sequence) ─────────────────────
  const courierAt =
    leg?.accepted_at ??
    (order && ["courier_assigned", "picked_up", "out_for_delivery", "delivered"].includes(order.status)
      ? order.accepted_at ?? order.ready_at
      : null);

  const steps: { key: string; at: string | null; icon: string }[] = order
    ? isService
      ? [
          { key: "step_placed", at: order.created_at, icon: "receipt-outline" },
          { key: "step_service_confirmed", at: order.accepted_at, icon: "construct-outline" },
          { key: "step_service_progress", at: order.prepared_at, icon: "time-outline" },
          { key: "step_delivered", at: order.delivered_at, icon: "checkmark-done-outline" },
        ]
      : [
          { key: "step_placed", at: order.created_at, icon: "receipt-outline" },
          { key: "step_accepted", at: order.accepted_at, icon: "storefront-outline" },
          { key: "step_preparing", at: order.prepared_at, icon: "restaurant-outline" },
          { key: "step_ready", at: order.ready_at, icon: "bag-check-outline" },
          ...(isDelivery
            ? [
                { key: "step_courier", at: courierAt, icon: "bicycle-outline" },
                { key: "step_picked_up", at: order.picked_up_at, icon: "cube-outline" },
              ]
            : []),
          {
            key: "step_delivered",
            at: order.delivered_at ?? (order.status === "self_delivered" ? order.updated_at : null),
            icon: "checkmark-done-outline",
          },
        ]
    : [];

  const currentIndex = steps.findIndex((s) => s.at == null);
  const allDone = order != null && currentIndex === -1;

  // ── Actions ─────────────────────────────────────────────────────
  const handleCancel = () => {
    if (!order || !data?.cancellable) return;
    const fee = data.cancel_fee_bdt ?? 0;
    Alert.alert(
      t("shops_track.cancel_confirm_title"),
      fee > 0
        ? t("shops_track.cancel_confirm_fee", { fee: formatBDT(fee) })
        : t("shops_track.cancel_confirm_free"),
      [
        { text: t("shops_track.cancel_keep"), style: "cancel" },
        {
          text: t("shops_track.cancel"),
          style: "destructive",
          onPress: async () => {
            setActing(true);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const token = session?.access_token;
              if (!token) return;
              const res = await fetch(`${SERVER_URL}/api/shop/orders/${order.id}/cancel`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                Alert.alert(t("common.error"), body.message || t("shops_track.cancel_fail"));
                return;
              }
              await fetchData(true);
            } catch (err) {
              logger.error("[order-tracking] cancel error", err);
              Alert.alert(t("common.error"), t("shops_track.cancel_fail"));
            } finally {
              setActing(false);
            }
          },
        },
      ],
    );
  };

  const handleConfirmPartial = async () => {
    if (!order) return;
    setActing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${SERVER_URL}/api/shop/orders/${order.id}/confirm-partial`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert(t("common.error"), body.message || t("shops_track.partial_fail"));
        return;
      }
      await fetchData(true);
    } catch (err) {
      logger.error("[order-tracking] confirm-partial error", err);
      Alert.alert(t("common.error"), t("shops_track.partial_fail"));
    } finally {
      setActing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (error || !order || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <TrackingHeader title={t("shops_track.title")} textPrimary={textPrimary} onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, textAlign: "center" }}>
            {t("shops_track.load_error")}
          </Text>
          <TouchableOpacity
            onPress={() => fetchData()}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
           testID="customer.shops.orders.id.fetch-data">
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>{t("shops_track.retry")}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const missingNames =
    data.items
      .filter((i) => (order.unavailable_item_ids ?? []).includes(i.product_id))
      .map((i) => i.product_name ?? "—")
      .join(", ") || "—";

  const partialPending =
    (order.unavailable_item_ids?.length ?? 0) > 0 && !order.partial_confirmed_at;

  const courierLabel = (() => {
    if (!isDelivery || !leg) return null;
    switch (leg.status) {
      case "created":
      case "offered":
        return t("shops_track.courier_searching");
      case "accepted":
        return t("shops_track.courier_assigned");
      case "picked_up":
        return t("shops_track.courier_picked_up");
      case "delivered":
        return t("shops_track.courier_delivered");
      case "failed":
        return t("shops_track.courier_failed");
      default:
        return null;
    }
  })();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <TrackingHeader
        title={data.shop_name ?? t("shops_track.title")}
        textPrimary={textPrimary}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1, paddingHorizontal: 20 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Status chip */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isCancelled
                ? colors.danger
                : allDone
                  ? colors.success
                  : colors.primary,
              marginRight: 10,
            }}
          />
          <Text style={{ flex: 1, fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>
            {t(`shops_track.status_${order.status}`)}
          </Text>
          {order.prep_minutes != null && !isService && ["accepted", "preparing"].includes(order.status) && (
            <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary }}>
              {t("shops_track.prep_estimate", { minutes: order.prep_minutes })}
            </Text>
          )}
        </View>

        {/* Partial confirm banner (out-of-stock) */}
        {partialPending && (
          <View
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor: colors.primary,
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 4 }}>
              {t("shops_track.partial_title")}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary, marginBottom: 12 }}>
              {t("shops_track.partial_body", { names: missingNames })}
            </Text>
            <TouchableOpacity
              onPress={handleConfirmPartial}
              disabled={acting}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
                opacity: acting ? 0.6 : 1,
              }}
             testID="customer.shops.orders.id.handle-confirm-partial">
              <Text style={{ color: "#FFFFFF", fontSize: 14, fontFamily: "JakartaSemiBold" }}>
                {t("shops_track.partial_confirm")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {order.partial_confirmed_at && (
          <View
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary }}>
              {t("shops_track.partial_done")}
            </Text>
          </View>
        )}

        {/* Timeline */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 12 }}>
          {t("shops_track.timeline")}
        </Text>
        <View
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          {steps.map((step, idx) => {
            const done = step.at != null;
            const current = idx === currentIndex;
            const isLast = idx === steps.length - 1;
            return (
              <View key={step.key} style={{ flexDirection: "row" }}>
                <View style={{ alignItems: "center", width: 28 }}>
                  <View
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: done
                        ? colors.primary
                        : current
                          ? (isDark ? "#1F2937" : "#F3F4F6")
                          : "transparent",
                      borderWidth: done || current ? 0 : 1.5,
                      borderColor,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name={step.icon as keyof typeof Ionicons.glyphMap}
                      size={14}
                      color={done ? "#FFFFFF" : current ? colors.primary : textSecondary}
                    />
                  </View>
                  {!isLast && (
                    <View
                      style={{
                        width: 2,
                        flex: 1,
                        minHeight: 18,
                        backgroundColor: done ? colors.primary : borderColor,
                        marginVertical: 2,
                      }}
                    />
                  )}
                </View>
                <View style={{ flex: 1, paddingBottom: isLast ? 0 : 14, paddingLeft: 10 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontFamily: done || current ? "JakartaSemiBold" : "JakartaMedium",
                      color: done || current ? textPrimary : textSecondary,
                    }}
                  >
                    {t(`shops_track.${step.key}`)}
                  </Text>
                  {step.at && (
                    <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 2 }}>
                      {new Date(step.at).toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Courier panel */}
        {courierLabel && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: 12,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <Ionicons name="bicycle-outline" size={20} color={colors.primary} style={{ marginRight: 10 }} />
            <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary }}>
              {courierLabel}
            </Text>
          </View>
        )}

        {/* Items */}
        <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary, marginBottom: 8 }}>
          {t("shops_track.items")}
        </Text>
        {data.items.map((item) => {
          const missing = (order.unavailable_item_ids ?? []).includes(item.product_id);
          return (
            <View
              key={item.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: surfaceBg,
                borderWidth: 1,
                borderColor,
                borderRadius: 12,
                padding: 12,
                marginBottom: 8,
                opacity: missing ? 0.5 : 1,
              }}
            >
              <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaMedium", color: textPrimary }}>
                {item.product_name ?? "—"} × {item.quantity}
                {missing ? `  (${t("shops_track.missing")})` : ""}
              </Text>
              <Text style={{ fontSize: 14, fontFamily: "JakartaBold", color: colors.primary }}>
                {formatBDT(item.line_total_bdt)}
              </Text>
            </View>
          );
        })}

        {/* Money */}
        <View
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: 12,
            padding: 14,
            marginTop: 8,
            marginBottom: 16,
          }}
        >
          <MoneyRow label={t("shops_track.subtotal")} value={formatBDT(order.subtotal_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} />
          {isDelivery && order.delivery_fee_bdt != null && (
            <MoneyRow label={t("shops_track.delivery_fee")} value={formatBDT(order.delivery_fee_bdt)} textPrimary={textPrimary} textSecondary={textSecondary} />
          )}
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <Text style={{ flex: 1, fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }}>{t("shops_track.total")}</Text>
            <Text style={{ fontSize: 17, fontFamily: "JakartaBold", color: colors.primary }}>{formatBDT(order.total_bdt)}</Text>
          </View>
          <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 6 }}>
            {t("shops_track.cod_hint")}
          </Text>
          {isCancelled && order.cancel_fee_bdt != null && (
            <Text style={{ fontSize: 12, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 4 }}>
              {t("shops_track.cancelled_fee", { fee: formatBDT(order.cancel_fee_bdt) })}
            </Text>
          )}
        </View>

        {/* Dispute link (F-38) */}
        <TouchableOpacity
          onPress={() => router.push(`/(main)/(customer)/report-issue?orderId=${order.id}`)}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, marginBottom: 16 }}
         testID="customer.shops.orders.id.push-report-issue">
          <Ionicons name="flag-outline" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: colors.primary }}>
            {t("shops_track.dispute")}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Cancel bar — pre-pickup only, server-computed */}
      {data.cancellable && !isCancelled && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: surfaceBg,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            padding: 16,
          }}
        >
          <TouchableOpacity
            onPress={handleCancel}
            disabled={acting}
            style={{
              borderWidth: 1.5,
              borderColor: colors.danger,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
              opacity: acting ? 0.6 : 1,
            }}
           testID="customer.shops.orders.id.handle-cancel">
            {acting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={{ fontSize: 15, fontFamily: "JakartaSemiBold", color: colors.danger }}>
                {t("shops_track.cancel")}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

function TrackingHeader({
  title,
  textPrimary,
  onBack,
}: {
  title: string;
  textPrimary: string;
  onBack: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
      <TouchableOpacity onPress={onBack} hitSlop={8} testID="customer.shops.orders.id.on-back">
        <Ionicons name="arrow-back" size={24} color={textPrimary} />
      </TouchableOpacity>
      <Text
        style={{
          flex: 1,
          fontSize: 20,
          fontFamily: "JakartaBold",
          color: textPrimary,
          marginLeft: 12,
        }}
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}

function MoneyRow({
  label,
  value,
  textPrimary,
  textSecondary,
}: {
  label: string;
  value: string;
  textPrimary: string;
  textSecondary: string;
}) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 4 }}>
      <Text style={{ flex: 1, fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: "JakartaSemiBold", color: textPrimary }}>{value}</Text>
    </View>
  );
}
