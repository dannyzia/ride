/**
 * Shop Owner dashboard (S3 §3).
 *
 * OWNER/MANAGER: availability toggles (open/closed — R5 the server rejects
 * new orders for a closed shop; busy — F-16 throttles, never closes),
 * orders-by-state counts, plans card (M-2 role-filtered listing), and the
 * order queue with accept (+ prep-time picker) / reject-with-reason /
 * prepare / mark-ready actions.
 * STAFF: orders-only view — no availability toggles, no money cards. The
 * server enforces those limits per route; this screen only mirrors them.
 *
 * Live updates: the shop WS socket (role "shop"); REST stays canonical —
 * events are hints to re-fetch, never state mutations (F25).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Modal,
  ActivityIndicator,
  TextInput,
  Alert,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { ensureShopSocket } from "@/lib/shopSocket";
import { logger } from "@/lib/logger";

interface ShopMine {
  shop: {
    id: string;
    name: string;
    status: string;
    is_verified: boolean;
    is_open: boolean;
    busy: boolean;
    logo_url: string | null;
  };
  role: "OWNER" | "MANAGER" | "STAFF";
  dashboard?: {
    orders_by_status: Record<string, number>;
    workshop: { pending: number; overdue: number; confirm_sla_hours: number };
    balance_bdt: number;
  };
}

interface ShopOrder {
  id: string;
  status: string;
  subtotal_bdt: number;
  total_bdt: number;
  order_kind: string;
  fulfillment: string;
  prep_minutes: number | null;
  created_at: string;
}

interface PlanRow {
  id: string;
  name: string;
  price_bdt: number;
  duration_days: number;
  call_count: number;
}

/** Taka display: money is integer paisa end-to-end; /100 here at render. */
function taka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}

const PREP_OPTIONS = [10, 15, 20, 30, 45, 60];

const SEGMENTS = [
  { key: "pending", label: "new" },
  { key: "accepted", label: "active" },
  { key: "preparing", label: "active" },
  { key: "ready_for_pickup", label: "ready" },
  { key: "out_for_delivery", label: "history" },
  { key: "delivered", label: "history" },
  { key: "cancelled", label: "history" },
] as const;

export default function ShopDashboardScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [mine, setMine] = useState<ShopMine | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [segment, setSegment] = useState<"new" | "active" | "ready" | "history">("new");
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [prepTarget, setPrepTarget] = useState<ShopOrder | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ShopOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const isOwnerOrManager = mine?.role === "OWNER" || mine?.role === "MANAGER";

  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      // mine resolves first (its shop id scopes the orders query); plans run
      // independently.
      const mineRes = await fetch(`${API_URL}/api/shop/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!mineRes.ok) {
        if (mineRes.status === 404) {
          // No shop bound to this account (verification still pending or none).
          setMine(null);
        }
        setLoading(false);
        return;
      }

      const shopData = (await mineRes.json()) as ShopMine;
      setMine(shopData);

      const [ordersRes, plansRes] = await Promise.all([
        fetch(
          `${API_URL}/api/shop/orders?shop_id=${shopData.shop.id}&limit=50`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
        fetch(`${API_URL}/api/package/list`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (ordersRes.ok) {
        const data = (await ordersRes.json()) as { orders: ShopOrder[] };
        setOrders(data.orders ?? []);
      }
      if (plansRes.ok) {
        const data = (await plansRes.json()) as { packages: PlanRow[] };
        setPlans(data.packages ?? []);
      }
    } catch (e) {
      logger.error("[shop.dashboard] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live hints: re-fetch on any shop event touched by this surface (F25 —
  // REST canonical, WS is a nudge only).
  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;
    let handler: ((e: MessageEvent) => void) | null = null;

    void (async () => {
      socket = await ensureShopSocket();
      if (!socket || cancelled) return;
      handler = (event: MessageEvent) => {
        const type = readType(event.data);
        if (
          type === "shop:order_status" ||
          type === "shop:availability" ||
          type === "shop:workshop_request_status"
        ) {
          void load();
        }
      };
      socket.addEventListener("message", handler);
    })();

    return () => {
      cancelled = true;
      if (socket && handler) socket.removeEventListener("message", handler);
    };
  }, [load]);

  const patchStatus = useCallback(
    async (order: ShopOrder, status: string, extra: Record<string, unknown> = {}) => {
      setActingId(order.id);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/shop/orders/${order.id}/status`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status, ...extra }),
        });
        if (!res.ok) {
          const body = (await res.json()) as { message?: string };
          Alert.alert(t("shop.dashboard.action_failed"), body.message ?? "");
          logger.warn("[shop.dashboard] status patch failed", { status: res.status });
        }
        await load();
      } finally {
        setActingId(null);
      }
    },
    [load, t],
  );

  const patchAvailability = useCallback(
    async (flags: { is_open?: boolean; busy?: boolean }) => {
      if (!mine) return;
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/shop/${mine.shop.id}/availability`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(flags),
        });
        if (!res.ok) {
          const body = (await res.json()) as { message?: string };
          Alert.alert(t("shop.dashboard.action_failed"), body.message ?? "");
          return;
        }
        setMine({ ...mine, shop: { ...mine.shop, ...flags } as ShopMine["shop"] });
      } catch (e) {
        logger.error("[shop.dashboard] availability patch failed", e);
      }
    },
    [mine, t],
  );

  const purchasePlan = useCallback(
    async (plan: PlanRow) => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/package/purchase`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ package_id: plan.id }),
        });
        const body = (await res.json()) as { invoice_url?: string; message?: string };
        if (res.ok && body.invoice_url) {
          void Linking.openURL(body.invoice_url);
        } else {
          Alert.alert(t("shop.dashboard.purchase_failed"), body.message ?? "");
        }
      } catch (e) {
        logger.error("[shop.dashboard] purchase failed", e);
      }
    },
    [t],
  );

  const visibleOrders = useMemo(() => {
    return orders.filter((o) => SEGMENTS.some((s) => s.key === o.status && s.label === segment));
  }, [orders, segment]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: C.bg }}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!mine) {
    return (
      <SafeAreaView className="flex-1 justify-center px-6" style={{ backgroundColor: C.bg }}>
        <Text className="text-[16px] font-JakartaBold" style={{ color: C.text }}>
          {t("shop.dashboard.no_shop_title")}
        </Text>
        <Text className="mt-2 text-[13px]" style={{ color: C.sub }}>
          {t("shop.dashboard.no_shop_body")}
        </Text>
      </SafeAreaView>
    );
  }

  const counts = mine.dashboard?.orders_by_status ?? {};

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mb-4">
          <View>
            <Text className="text-[20px] font-JakartaBold" style={{ color: C.text }}>
              {mine.shop.name}
            </Text>
            <Text className="text-[12px]" style={{ color: C.sub }}>
              {mine.shop.is_verified
                ? t("shop.dashboard.verified")
                : t("shop.dashboard.pending_verification")}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              onPress={() => router.push("/(main)/(customer)/(shops)")}
             
             testID="shop-owner.push-shops">
              <Ionicons name="storefront-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(main)/(shop-owner)/settlement")}
             
             testID="shop-owner.push-settlement">
              <Ionicons name="wallet-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(main)/(shop-owner)/staff")}
             
             testID="shop-owner.push-staff">
              <Ionicons name="people-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(main)/(shop-owner)/workshop")}
             
             testID="shop-owner.push-workshop">
              <Ionicons name="construct-outline" size={24} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(main)/(shop-owner)/catalog")}
             
             testID="shop-owner.push-catalog">
              <Ionicons name="grid-outline" size={24} color={C.text} />
            </TouchableOpacity>
          </View>
        </View>

        {/* STAFF is orders-only (§3): below this line no money/mode controls. */}
        {isOwnerOrManager ? (
          <>
            {/* Availability — open/closed (R5) + busy (F-16 throttle) */}
            <View
              className="rounded-2xl p-4 mb-4"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <View className="flex-row justify-between items-center mb-3">
                <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                  {t("shop.dashboard.open_closed")}
                </Text>
                <Switch
                  value={mine.shop.is_open}
                  onValueChange={(v) => void patchAvailability({ is_open: v })}
                 
                 testID="shop-owner.patch-availability"/>
              </View>
              <Text className="text-[11px] mb-3" style={{ color: C.sub }}>
                {t("shop.dashboard.open_hint")}
              </Text>
              <View className="flex-row justify-between items-center">
                <Text className="text-[14px] font-JakartaBold" style={{ color: C.text }}>
                  {t("shop.dashboard.busy_mode")}
                </Text>
                <Switch
                  value={mine.shop.busy}
                  onValueChange={(v) => void patchAvailability({ busy: v })}
                 
                 testID="shop-owner.patch-availability-2"/>
              </View>
              <Text className="text-[11px] mt-1" style={{ color: C.sub }}>
                {t("shop.dashboard.busy_hint")}
              </Text>
            </View>

            {/* Counts by state */}
            <View className="flex-row flex-wrap gap-2 mb-4">
              {(["pending", "accepted", "preparing", "ready_for_pickup"] as const).map((s) => (
                <View
                  key={s}
                  className="rounded-xl px-3 py-2"
                  style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
                >
                  <Text className="text-[11px]" style={{ color: C.sub }}>
                    {t(`shop.state.${s}`)}
                  </Text>
                  <Text className="text-[15px] font-JakartaBold" style={{ color: C.text }}>
                    {counts[s] ?? 0}
                  </Text>
                </View>
              ))}
            </View>

            {/* Settlement balance + payout settings (§12/§3 payouts link) */}
            <View
              className="rounded-2xl p-4 mb-4 flex-row items-center justify-between"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <View>
                <Text className="text-[11px]" style={{ color: C.sub }}>
                  {t("shop.dashboard.settlement_balance")}
                </Text>
                <Text className="text-[17px] font-JakartaBold" style={{ color: C.text }}>
                  {taka(mine.dashboard?.balance_bdt ?? 0)}
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-xl px-4 py-2"
                style={{ backgroundColor: colors.primary }}
                onPress={() => router.push("/(main)/(rider)/payout-method")}
               
               testID="shop-owner.push-payout-method">
                <Text className="text-[12px]" style={{ color: colors.white }}>
                  {t("shop.dashboard.payout_method")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Workshop SLA card (2h confirm SLA) */}
            {(mine.dashboard?.workshop.pending ?? 0) > 0 ? (
              <TouchableOpacity
                className="rounded-2xl p-4 mb-4 flex-row items-center justify-between"
                style={{
                  backgroundColor: C.surface,
                  borderWidth: 1,
                  borderColor:
                    (mine.dashboard?.workshop.overdue ?? 0) > 0
                      ? colors.danger
                      : C.border,
                }}
                onPress={() => router.push("/(main)/(shop-owner)/workshop")}
               
               testID="shop-owner.push-workshop-2">
                <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                  {t("shop.dashboard.workshop_pending", {
                    n: mine.dashboard?.workshop.pending ?? 0,
                  })}
                </Text>
                {(mine.dashboard?.workshop.overdue ?? 0) > 0 ? (
                  <Text className="text-[12px]" style={{ color: colors.danger }}>
                    {t("shop.dashboard.workshop_overdue", {
                      n: mine.dashboard?.workshop.overdue ?? 0,
                    })}
                  </Text>
                ) : (
                  <Text className="text-[12px]" style={{ color: C.sub }}>
                    {t("shop.dashboard.workshop_sla_ok", {
                      h: mine.dashboard?.workshop.confirm_sla_hours ?? 2,
                    })}
                  </Text>
                )}
              </TouchableOpacity>
            ) : null}

            {/* Plans (M-2 role-filtered listing) */}
            {plans.length > 0 ? (
              <View
                className="rounded-2xl p-4 mb-4"
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              >
                <Text className="text-[13px] font-JakartaBold mb-2" style={{ color: C.text }}>
                  {t("shop.dashboard.plans_title")}
                </Text>
                {plans.map((p) => (
                  <View key={p.id} className="flex-row items-center justify-between py-2">
                    <View className="flex-1 pr-3">
                      <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                        {p.name}
                      </Text>
                      <Text className="text-[11px]" style={{ color: C.sub }}>
                        {t("shop.dashboard.plan_meta", {
                          calls: p.call_count,
                          days: p.duration_days,
                        })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      className="rounded-lg px-3 py-2"
                      style={{ backgroundColor: colors.primary }}
                      onPress={() => void purchasePlan(p)}
                     
                     testID="shop-owner.purchase-plan">
                      <Text className="text-[12px]" style={{ color: colors.white }}>
                        {taka(p.price_bdt)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {/* Order queue */}
        <View className="flex-row mb-3 gap-2">
          {(["new", "active", "ready", "history"] as const).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setSegment(s)}
              className="flex-1 rounded-xl py-2"
              style={{
                backgroundColor: segment === s ? colors.primary : C.surface,
                borderWidth: 1,
                borderColor: segment === s ? colors.primary : C.border,
              }}
             
             testID="shop-owner.set-segment">
              <Text
                className="text-[12px] text-center font-JakartaBold"
                style={{ color: segment === s ? colors.white : C.sub }}
              >
                {t(`shop.dashboard.segment_${s}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {visibleOrders.length === 0 ? (
          <Text className="text-[13px] text-center py-8" style={{ color: C.sub }}>
            {t("shop.dashboard.no_orders")}
          </Text>
        ) : (
          visibleOrders.map((o) => (
            <View
              key={o.id}
              className="rounded-2xl p-4 mb-3"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
            >
              <View className="flex-row justify-between items-center mb-2">
                <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                  {t(`shop.state.${o.status}`)}
                </Text>
                <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                  {taka(o.total_bdt)}
                </Text>
              </View>
              <Text className="text-[11px] mb-3" style={{ color: C.sub }}>
                {t(`shop.order_kind.${o.order_kind}`)}
                {o.fulfillment === "delivery"
                  ? ` · ${t("shop.order_kind.delivery")}`
                  : ` · ${t("shop.order_kind.pickup")}`}
                {o.prep_minutes
                  ? ` · ${t("shop.dashboard.prep_est", { n: o.prep_minutes })}`
                  : ""}
              </Text>

              {o.status === "pending" ? (
                <View className="flex-row gap-2">
                  <TouchableOpacity
                    className="flex-1 rounded-xl py-2 items-center"
                    style={{ backgroundColor: colors.primary }}
                    disabled={actingId === o.id}
                    onPress={() => setPrepTarget(o)}
                   
                   testID="shop-owner.set-prep-target">
                    <Text className="text-[12px]" style={{ color: colors.white }}>
                      {t("shop.dashboard.accept")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="flex-1 rounded-xl py-2 items-center"
                    style={{ borderWidth: 1, borderColor: colors.danger }}
                    disabled={actingId === o.id}
                    onPress={() => {
                      setRejectReason("");
                      setRejectTarget(o);
                    }}
                   
                   testID="shop-owner.set-reject-reason">
                    <Text className="text-[12px]" style={{ color: colors.danger }}>
                      {t("shop.dashboard.reject")}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {o.status === "accepted" ? (
                <TouchableOpacity
                  className="rounded-xl py-2 items-center"
                  style={{ backgroundColor: colors.primary }}
                  disabled={actingId === o.id}
                  onPress={() => void patchStatus(o, "preparing")}
                 
                 testID="shop-owner.patch-status">
                  <Text className="text-[12px]" style={{ color: colors.white }}>
                    {t("shop.dashboard.prepare")}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {o.status === "preparing" ? (
                <TouchableOpacity
                  className="rounded-xl py-2 items-center"
                  style={{ backgroundColor: colors.primary }}
                  disabled={actingId === o.id}
                  onPress={() => void patchStatus(o, "ready_for_pickup")}
                 
                 testID="shop-owner.patch-status-2">
                  <Text className="text-[12px]" style={{ color: colors.white }}>
                    {t("shop.dashboard.mark_ready")}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {o.status === "out_for_delivery" ? (
                <TouchableOpacity
                  className="rounded-xl py-2 items-center"
                  style={{ backgroundColor: colors.primary }}
                  disabled={actingId === o.id}
                  onPress={() => void patchStatus(o, "delivered")}
                 
                 testID="shop-owner.patch-status-3">
                  <Text className="text-[12px]" style={{ color: colors.white }}>
                    {t("shop.dashboard.delivered")}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Prep-time picker (accept) */}
      <Modal
        visible={prepTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPrepTarget(null)}
      >
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="rounded-2xl p-5 w-full" style={{ backgroundColor: C.surface }}>
            <Text className="text-[15px] font-JakartaBold mb-4" style={{ color: C.text }}>
              {t("shop.dashboard.prep_picker_title")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {PREP_OPTIONS.map((m) => (
                <TouchableOpacity
                  key={m}
                  className="rounded-xl px-4 py-2"
                  style={{ backgroundColor: C.bg, borderWidth: 1, borderColor: C.border }}
                  onPress={() => {
                    const target = prepTarget;
                    setPrepTarget(null);
                    if (target) void patchStatus(target, "accepted", { prep_minutes: m });
                  }}
                 
                 testID="shop-owner.set-prep-target-2">
                  <Text className="text-[13px]" style={{ color: C.text }}>
                    {t("shop.dashboard.prep_min", { n: m })}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {/* Reject with reason (R6-visible to the customer) */}
      <Modal
        visible={rejectTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRejectTarget(null)}
      >
        <View className="flex-1 items-center justify-center px-6" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
          <View className="rounded-2xl p-5 w-full" style={{ backgroundColor: C.surface }}>
            <Text className="text-[15px] font-JakartaBold mb-3" style={{ color: C.text }}>
              {t("shop.dashboard.reject_title")}
            </Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
              placeholder={t("shop.dashboard.reject_placeholder")}
              placeholderTextColor={C.sub}
              className="rounded-xl border px-3 py-2 mb-4 text-[13px]"
              style={{ color: C.text, borderColor: C.border, minHeight: 80, backgroundColor: C.bg }}
             
             testID="shop-owner.set-reject-reason-2"/>
            <View className="flex-row gap-2">
              <TouchableOpacity
                className="flex-1 rounded-xl py-2 items-center"
                style={{ borderWidth: 1, borderColor: C.border }}
                onPress={() => setRejectTarget(null)}
               
               testID="shop-owner.set-reject-target">
                <Text style={{ color: C.text }}>{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl py-2 items-center"
                style={{ backgroundColor: colors.danger }}
                onPress={() => {
                  const target = rejectTarget;
                  setRejectTarget(null);
                  if (target)
                    void patchStatus(target, "cancelled", {
                      cancel_reason: rejectReason || undefined,
                    });
                }}
               
               testID="shop-owner.set-reject-target-2">
                <Text style={{ color: colors.white }}>{t("shop.dashboard.reject")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function readType(data: unknown): string | null {
  try {
    const parsed = JSON.parse(String(data)) as { type?: unknown };
    return typeof parsed.type === "string" ? parsed.type : null;
  } catch {
    return null;
  }
}
