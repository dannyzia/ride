/**
 * Delivery Man surface — earnings (plan 27 §6 / §12): fee × 100% at launch
 * (delivery_commission_percent seed 0 → courier keeps the whole fee), COD
 * remittance dues with the F-33 declare-a-drop action, short-pay evidence
 * (F-38) on the due row, and the courier rating.
 *
 * Read-only money — lib/deliverySettlement.ts is the sole writer.
 */
import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
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
import { formatDateTime } from "@/lib/format";

interface EarningRow {
  id: string;
  leg_id: string;
  fee_bdt: number;
  commission_bdt: number;
  net_bdt: number;
  created_at: string;
  shop_name: string | null;
}

interface DueRow {
  id: string;
  leg_id: string;
  amount_bdt: number;
  status: string;
  remittance_note: string | null;
  created_at: string;
  remitted_at: string | null;
}

interface EarningsResponse {
  kind: string;
  rating: string | null;
  dispatch_held: boolean;
  totals: { earned_bdt: number; pending_dues_bdt: number };
  earnings: EarningRow[];
  dues: DueRow[];
}

export default function DeliveryEarningsScreen() {
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

  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        router.replace("/(auth)/login");
        return;
      }
      const res = await fetch(`${API_URL}/api/delivery/earnings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`earnings GET ${res.status}`);
      setData((await res.json()) as EarningsResponse);
    } catch (e) {
      logger.warn("[delivery earnings] load failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const declareRemittance = useCallback(
    async (dueId: string) => {
      setBusyId(dueId);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/delivery/remittance/${dueId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            message?: string;
          } | null;
          Alert.alert(t("delivery.active.error_title"), body?.message ?? t("delivery.active.error_generic"));
          return;
        }
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load, t],
  );

  const ratingPaisa = data?.rating ? Math.round(parseFloat(data.rating) * 100) : null;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <View
        className="flex-row items-center px-[16px] py-[14px] border-b"
        style={{ borderColor: C.border }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
          accessibilityLabel={t("delivery.active.back")}
         
         testID="delivery.earnings.el-1">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: C.text }}>
          {t("delivery.earnings.title")}
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {/* Totals */}
          <View className="flex-row gap-3">
            <View
              className="flex-1 rounded-[14px] p-4 border"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
              testID="delivery.earnings.total-card"
            >
              <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                {t("delivery.earnings.total_earned")}
              </Text>
              <Text className="text-[20px] font-JakartaBold mt-1" style={{ color: colors.primary }}>
                {taka(data?.totals.earned_bdt ?? 0)}
              </Text>
            </View>
            <View
              className="flex-1 rounded-[14px] p-4 border"
              style={{ borderColor: C.border, backgroundColor: C.surface }}
              testID="delivery.earnings.dues-card"
            >
              <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                {t("delivery.earnings.pending_dues")}
              </Text>
              <Text
                className="text-[20px] font-JakartaBold mt-1"
                style={{ color: (data?.totals.pending_dues_bdt ?? 0) > 0 ? colors.danger : C.text }}
              >
                {taka(data?.totals.pending_dues_bdt ?? 0)}
              </Text>
            </View>
          </View>

          {data?.dispatch_held ? (
            <View
              className="rounded-[12px] p-3 mt-3 border"
              style={{ borderColor: colors.danger, backgroundColor: C.surface }}
              testID="delivery.earnings.hold-banner"
            >
              <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.danger }}>
                {t("delivery.inbox.hold_title")}
              </Text>
              <Text className="text-[12px] font-Jakarta mt-1" style={{ color: C.sub }}>
                {t("delivery.earnings.hold_body")}
              </Text>
            </View>
          ) : null}

          {/* Rating (F-15 trust signal) */}
          <View
            className="flex-row items-center gap-2 rounded-[14px] p-4 mt-3 border"
            style={{ borderColor: C.border, backgroundColor: C.surface }}
            testID="delivery.earnings.rating-card"
          >
            <Ionicons name="star" size={18} color={colors.amber} />
            <Text className="text-[15px] font-JakartaSemiBold" style={{ color: C.text }}>
              {ratingPaisa !== null
                ? t("delivery.earnings.rating_value", { value: (ratingPaisa / 100).toFixed(2) })
                : t("delivery.earnings.rating_unrated")}
            </Text>
          </View>

          {/* Remittance dues */}
          <Text
            className="text-[11px] font-JakartaSemiBold uppercase mt-5 mb-2"
            style={{ color: C.sub, letterSpacing: 0.5 }}
          >
            {t("delivery.earnings.dues_title")}
          </Text>
          {(data?.dues ?? []).length === 0 ? (
            <Text className="text-[13px] font-Jakarta" style={{ color: C.sub }}>
              {t("delivery.earnings.no_dues")}
            </Text>
          ) : (
            <View className="rounded-[12px] overflow-hidden border" style={{ borderColor: C.border }}>
              {(data?.dues ?? []).map((due, i) => (
                <View
                  key={due.id}
                  className="px-3 py-3"
                  style={{
                    backgroundColor: C.surface,
                    borderBottomWidth: i < (data?.dues.length ?? 0) - 1 ? 1 : 0,
                    borderColor: C.border,
                  }}
                  testID="delivery.earnings.due-row"
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-[14px] font-JakartaSemiBold" style={{ color: C.text }}>
                        {taka(due.amount_bdt)}
                      </Text>
                      <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                        {formatDateTime(due.created_at)}
                      </Text>
                      {due.remittance_note ? (
                        <Text className="text-[11px] font-Jakarta mt-1" style={{ color: colors.danger }}>
                          {due.remittance_note}
                        </Text>
                      ) : null}
                    </View>
                    {due.status === "pending" ? (
                      <TouchableOpacity
                        className="rounded-[10px] px-3 py-2 border"
                        style={{ borderColor: colors.primary, opacity: busyId === due.id ? 0.6 : 1 }}
                        disabled={busyId === due.id}
                        onPress={() => void declareRemittance(due.id)}
                       
                       testID="delivery.earnings.declare-remittance">
                        <Text className="text-[13px] font-JakartaSemiBold" style={{ color: colors.primary }}>
                          {t("delivery.earnings.remit_button")}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text
                        className="text-[12px] font-JakartaSemiBold px-2 py-1 rounded-full"
                        style={{ color: colors.success, backgroundColor: colors.successLight }}
                      >
                        {t(`delivery.earnings.due_${due.status}`)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Earnings history (fee × 100% at launch) */}
          <Text
            className="text-[11px] font-JakartaSemiBold uppercase mt-5 mb-2"
            style={{ color: C.sub, letterSpacing: 0.5 }}
          >
            {t("delivery.earnings.history_title")}
          </Text>
          {(data?.earnings ?? []).length === 0 ? (
            <Text className="text-[13px] font-Jakarta" style={{ color: C.sub }}>
              {t("delivery.earnings.no_earnings")}
            </Text>
          ) : (
            <View className="rounded-[12px] overflow-hidden border" style={{ borderColor: C.border }}>
              {(data?.earnings ?? []).map((row, i) => (
                <View
                  key={row.id}
                  className="flex-row items-center justify-between px-3 py-3"
                  style={{
                    backgroundColor: C.surface,
                    borderBottomWidth: i < (data?.earnings.length ?? 0) - 1 ? 1 : 0,
                    borderColor: C.border,
                  }}
                  testID="delivery.earnings.earning-row"
                >
                  <View className="flex-1 pr-3">
                    <Text className="text-[13px] font-JakartaSemiBold" style={{ color: C.text }} numberOfLines={1}>
                      {row.shop_name ?? t("delivery.vertical.shop_order")}
                    </Text>
                    <Text className="text-[11px] font-Jakarta" style={{ color: C.sub }}>
                      {formatDateTime(row.created_at)}
                      {row.commission_bdt > 0
                        ? ` · ${t("delivery.earnings.commission")}: ${taka(row.commission_bdt)}`
                        : ""}
                    </Text>
                  </View>
                  <Text className="text-[14px] font-JakartaSemiBold" style={{ color: colors.primary }}>
                    {taka(row.net_bdt)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
