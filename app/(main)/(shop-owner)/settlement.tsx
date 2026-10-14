/**
 * Settlement (S3 §12) — the shop_ledger system of record rendered for the
 * shop. OWNER/MANAGER only (the route gates; STAFF never sees money per §3).
 *
 * Money is SIGNED integer paisa in entries; balance = sum. /100 at render.
 */
import { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";

interface LedgerEntry {
  id: string;
  order_id: string | null;
  entry_type: "order_revenue" | "commission" | "payout" | "adjustment" | "reversal";
  amount_bdt: number;
  note: string | null;
  created_at: string;
}

export default function ShopSettlementScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        router.back();
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const mineRes = await fetch(`${API_URL}/api/shop/mine`, { headers });
      if (!mineRes.ok) {
        router.back();
        return;
      }
      const mine = (await mineRes.json()) as { shop: { id: string } };
      const res = await fetch(`${API_URL}/api/shop/${mine.shop.id}/settlement`, { headers });
      if (!res.ok) {
        // 403 (STAFF) → leave the screen; the server is the gate.
        const body = (await res.json()) as { message?: string };
        logger.warn("[shop.settlement] fetch failed", { status: res.status, message: body.message });
        router.back();
        return;
      }
      const data = (await res.json()) as { entries: LedgerEntry[]; balance_bdt: number };
      setEntries(data.entries ?? []);
      setBalance(data.balance_bdt ?? 0);
    } catch (e) {
      logger.error("[shop.settlement] load failed", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const taka = (paisa: number) => `৳${(paisa / 100).toFixed(2)}`;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity onPress={() => router.back()} testID="shop-owner.settlement.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("shop.settlement.title")}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View
            className="rounded-2xl p-5 mb-4 items-center"
            style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
          >
            <Text className="text-[12px]" style={{ color: C.sub }}>
              {t("shop.settlement.balance")}
            </Text>
            <Text className="text-[26px] font-JakartaBold mt-1" style={{ color: C.text }}>
              {taka(balance)}
            </Text>
          </View>

          {entries.length === 0 ? (
            <Text className="text-[13px] text-center py-10" style={{ color: C.sub }}>
              {t("shop.settlement.no_entries")}
            </Text>
          ) : (
            entries.map((e) => (
              <View
                key={e.id}
                className="rounded-2xl p-4 mb-2 flex-row justify-between items-center"
                style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              >
                <View className="flex-1 pr-3">
                  <Text className="text-[13px] font-JakartaBold" style={{ color: C.text }}>
                    {t(`shop.settlement.entry_${e.entry_type}`)}
                  </Text>
                  <Text className="text-[11px]" style={{ color: C.sub }}>
                    {new Date(e.created_at).toLocaleString()}
                    {e.order_id ? ` · ${e.order_id.slice(0, 8)}` : ""}
                  </Text>
                  {e.note ? (
                    <Text className="text-[11px]" style={{ color: C.sub }}>
                      {e.note}
                    </Text>
                  ) : null}
                </View>
                <Text
                  className="text-[14px] font-JakartaBold"
                  style={{ color: e.amount_bdt >= 0 ? colors.primary : colors.danger }}
                >
                  {e.amount_bdt >= 0 ? "+" : ""}
                  {taka(e.amount_bdt)}
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
