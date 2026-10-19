/**
 * Delivery Man surface — dispatched-offers inbox (S6, plan 27 §6.1).
 *
 * The §6.1 flow: the ONE live offer with full details (shop, pickup,
 * customer contact, dropoff, order value, fee, parcel class) → accept /
 * reject (reject advances the chain on the next tick), the active accepted
 * delivery (one active job at a time — Amendment 2), the F-33 dispatch-hold
 * banner, and recent history. Earnings summary links to the earnings tab.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useTaka } from "@/lib/useTaka";

interface LegDetail {
  id: string;
  status: string;
  source_vertical: string;
  pickup_address: string | null;
  dropoff_address: string | null;
  delivery_fee_bdt: number | null;
  offer_expires_at: string | null;
  order_total_bdt: number | null;
  shop_name: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  parcel_class: string | null;
}

interface HistoryRow {
  id: string;
  status: string;
  source_vertical: string;
  delivery_fee_bdt: number | null;
  delivered_at: string | null;
  shop_name: string | null;
}

interface OffersResponse {
  kind: "courier" | "driver";
  dispatch_held: boolean;
  offer: LegDetail | null;
  active: LegDetail | null;
  history: HistoryRow[];
}

const VERTICAL_KEY: Record<string, string> = {
  shop_order: "shop_order",
  food_order: "food_order",
  workshop_product: "workshop_product",
  p2p_parcel: "p2p_parcel",
};

export default function DeliveryInboxScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const taka = useTaka();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [data, setData] = useState<OffersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ineligible, setIneligible] = useState(false);
  const [busy, setBusy] = useState(false);
  // C7-5: the last respond failure, as an inbox i18n key — rendered on the
  // offer row (expired / claimed / hold each get their own message, never
  // silent). Cleared on the next respond attempt or successful reload.
  const [respondError, setRespondError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setRespondError(null);
    }
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        router.replace("/(auth)/login");
        return;
      }
      const res = await fetch(`${API_URL}/api/delivery/offers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 403) {
        // Server is the gate: no active courier row / toggle OFF / not active.
        setIneligible(true);
        setData(null);
        return;
      }
      if (!res.ok) throw new Error(`offers GET ${res.status}`);
      setIneligible(false);
      setData((await res.json()) as OffersResponse);
    } catch (e) {
      logger.warn("[delivery inbox] load failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = useCallback(
    async (legId: string, decision: "accept" | "reject") => {
      setBusy(true);
      setRespondError(null);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/delivery/offers/${legId}/respond`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ decision }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            message?: string;
          } | null;
          logger.warn("[delivery inbox] respond failed", { status: res.status, error: body?.error });
          const code = body?.error ?? "";
          setRespondError(
            code === "offer_expired"
              ? "delivery.inbox.respond_expired"
              : code === "already_claimed" || code === "concurrent_transition" || code === "offer_unavailable"
                ? "delivery.inbox.respond_claimed"
                : code === "dispatch_hold_active"
                  ? "delivery.inbox.respond_hold"
                  : "delivery.inbox.respond_failed",
          );
          await load(true);
          return;
        }
        if (decision === "accept") {
          await load(true);
          router.push(`/(main)/(delivery)/active/${legId}` as never);
        } else {
          await load(true);
        }
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  // Named per-branch wrappers (2026-10-15): the testID codemod derives an
  // element's id from the FIRST named call in its handler, so distinct handler
  // names are what make these two buttons derive `delivery.respond-accept` /
  // `delivery.respond-reject` instead of one shared `respond` id plus a
  // positional `-2` suffix (the `respond-el` / `respond-el-2` debt).
  const respondAccept = useCallback((legId: string) => respond(legId, "accept"), [respond]);
  const respondReject = useCallback((legId: string) => respond(legId, "reject"), [respond]);

  const offer = data?.offer ?? null;
  const active = data?.active ?? null;
  const history = data?.history ?? [];

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        className="flex-row items-center justify-between px-[16px] py-[14px] border-b"
        style={{ borderColor: C.border }}
      >
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: C.text }}>
          {t("delivery.inbox.title")}
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(main)/(delivery)/earnings" as never)}
          className="flex-row items-center gap-1 px-2 py-1"
          accessibilityLabel={t("delivery.earnings.title")}
         
         testID="delivery.push-earnings">
          <Ionicons name="wallet-outline" size={18} color={colors.primary} />
          <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.primary }}>
            {t("delivery.earnings.title")}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load(true);
              }}
              tintColor={colors.primary}
            />
          }
        >
          {ineligible ? (
            <View className="items-center py-10 gap-3">
              <Ionicons name="lock-closed-outline" size={40} color={C.sub} />
              <Text className="text-[15px] font-JakartaSemiBold text-center" style={{ color: C.text }}>
                {t("delivery.inbox.not_eligible_title")}
              </Text>
              <Text className="text-[13px] font-Jakarta text-center" style={{ color: C.sub }}>
                {t("delivery.inbox.not_eligible_body")}
              </Text>
            </View>
          ) : (
            <>
              {data?.dispatch_held ? (
                <View
                  className="rounded-[12px] p-3 mb-4 border"
                  style={{ borderColor: colors.danger, backgroundColor: C.surface }}
                  testID="delivery.inbox.hold-banner"
                >
                  <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.danger }}>
                    {t("delivery.inbox.hold_title")}
                  </Text>
                  <Text className="text-[12px] font-Jakarta mt-1" style={{ color: C.sub }}>
                    {t("delivery.inbox.hold_body")}
                  </Text>
                </View>
              ) : null}

              {active ? (
                <TouchableOpacity
                  className="rounded-[14px] p-4 mb-4 border"
                  style={{ borderColor: C.border, backgroundColor: C.surface }}
                  onPress={() => router.push(`/(main)/(delivery)/active/${active.id}` as never)}
                 
                 testID="delivery.push-active">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-[11px] font-JakartaSemiBold uppercase" style={{ color: colors.primary }}>
                      {t(`delivery.status.${active.status}`)}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={C.sub} />
                  </View>
                  <Text className="text-[15px] font-JakartaSemiBold" style={{ color: C.text }}>
                    {active.shop_name ?? t(`delivery.vertical.${VERTICAL_KEY[active.source_vertical] ?? "shop_order"}`)}
                  </Text>
                  <Text className="text-[13px] font-Jakarta mt-1" style={{ color: C.sub }} numberOfLines={2}>
                    {active.dropoff_address ?? "—"}
                  </Text>
                  <Text className="text-[14px] font-JakartaSemiBold mt-2" style={{ color: C.text }}>
                    {t("delivery.inbox.fee")}: {taka(active.delivery_fee_bdt)}
                  </Text>
                </TouchableOpacity>
              ) : null}

              {offer ? (
                <View
                  className="rounded-[14px] p-4 mb-4 border-2"
                  style={{ borderColor: colors.primary, backgroundColor: C.surface }}
                  testID="delivery.inbox.offer-card"
                >
                  <Text className="text-[11px] font-JakartaSemiBold uppercase mb-2" style={{ color: colors.primary }}>
                    {t("delivery.inbox.new_offer")}
                  </Text>
                  {respondError ? (
                    <View className="flex-row items-center rounded-lg px-3 py-2 mb-2" style={{ backgroundColor: colors.danger + "1A" }}>
                      <Ionicons name="alert-circle-outline" size={15} color={colors.danger} />
                      <Text className="text-[12px] font-Jakarta flex-1 ml-2" style={{ color: colors.danger }}>
                        {t(respondError)}
                      </Text>
                    </View>
                  ) : null}
                  <Text className="text-[16px] font-JakartaBold" style={{ color: C.text }}>
                    {offer.shop_name ??
                      t(`delivery.vertical.${VERTICAL_KEY[offer.source_vertical] ?? "shop_order"}`)}
                  </Text>

                  <View className="mt-3 gap-2">
                    <View className="flex-row gap-2">
                      <Ionicons name="storefront-outline" size={15} color={C.sub} />
                      <Text className="text-[13px] font-Jakarta flex-1" style={{ color: C.text }}>
                        {offer.pickup_address ?? "—"}
                      </Text>
                    </View>
                    <View className="flex-row gap-2">
                      <Ionicons name="location-outline" size={15} color={C.sub} />
                      <Text className="text-[13px] font-Jakarta flex-1" style={{ color: C.text }}>
                        {offer.dropoff_address ?? "—"}
                      </Text>
                    </View>
                    {offer.customer_name || offer.customer_phone ? (
                      <View className="flex-row gap-2 items-center">
                        <Ionicons name="person-outline" size={15} color={C.sub} />
                        <Text className="text-[13px] font-Jakarta flex-1" style={{ color: C.text }}>
                          {offer.customer_name ?? ""}
                          {offer.customer_phone ? ` · ${offer.customer_phone}` : ""}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View className="flex-row justify-between mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
                    <View>
                      <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                        {t("delivery.inbox.order_value")}
                      </Text>
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                        {taka(offer.order_total_bdt)}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                        {t("delivery.inbox.fee")}
                      </Text>
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: colors.primary }}>
                        {taka(offer.delivery_fee_bdt)}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                        {t("delivery.inbox.class")}
                      </Text>
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                        {t(`delivery.vertical.${VERTICAL_KEY[offer.parcel_class ?? offer.source_vertical] ?? "shop_order"}`)}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-3 mt-4">
                    <TouchableOpacity
                      className="flex-1 rounded-[12px] py-3 items-center border"
                      style={{ borderColor: C.border, opacity: busy ? 0.6 : 1 }}
                      disabled={busy}
                      onPress={() => void respondReject(offer.id)}
                     
                      testID="delivery.respond-reject">
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                        {t("delivery.inbox.reject")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      className="flex-1 rounded-[12px] py-3 items-center"
                      style={{ backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }}
                      disabled={busy}
                      onPress={() => void respondAccept(offer.id)}
                     
                      testID="delivery.respond-accept">
                      <Text className="text-[14px] font-JakartaSemiBold text-white">
                        {t("delivery.inbox.accept")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {!offer && !active ? (
                <View className="items-center py-10 gap-2" testID="delivery.inbox.empty-state">
                  <Ionicons name="cube-outline" size={40} color={C.sub} />
                  <Text className="text-[15px] font-JakartaSemiBold" style={{ color: C.text }}>
                    {t("delivery.inbox.empty_title")}
                  </Text>
                  <Text className="text-[13px] font-Jakarta text-center" style={{ color: C.sub }}>
                    {t("delivery.inbox.empty_body")}
                  </Text>
                </View>
              ) : null}

              {history.length > 0 ? (
                <View className="mt-2">
                  <Text
                    className="text-[11px] font-JakartaSemiBold uppercase mb-2"
                    style={{ color: C.sub, letterSpacing: 0.5 }}
                  >
                    {t("delivery.inbox.history")}
                  </Text>
                  <View className="rounded-[12px] overflow-hidden border" style={{ borderColor: C.border }}>
                    {history.map((h, i) => (
                      <View
                        key={h.id}
                        className="flex-row items-center justify-between px-3 py-3"
                        style={{
                          backgroundColor: C.surface,
                          borderBottomWidth: i < history.length - 1 ? 1 : 0,
                          borderColor: C.border,
                        }}
                        testID="delivery.inbox.history-row"
                      >
                        <View className="flex-1 pr-3">
                          <Text className="text-[13px] font-JakartaSemiBold" style={{ color: C.text }} numberOfLines={1}>
                            {h.shop_name ??
                              t(`delivery.vertical.${VERTICAL_KEY[h.source_vertical] ?? "shop_order"}`)}
                          </Text>
                          <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                            {t(`delivery.status.${h.status}`)}
                          </Text>
                        </View>
                        <Text className="text-[13px] font-JakartaSemiBold" style={{ color: C.text }}>
                          {taka(h.delivery_fee_bdt)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
