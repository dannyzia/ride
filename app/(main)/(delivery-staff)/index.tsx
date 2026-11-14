/**
 * Delivery staff dashboard (Item 12) — the delivery-man staff landing hub.
 *
 * Mirrors the shop-owner dashboard hub shape, but scoped to the delivery
 * operator surface (delivery staff are a non-driver operator role). The hub
 * links to /packages and /dues (the two monetization surfaces shared with
 * shop/fleet via lib/operatorPurchase + /api/delivery/packages + /api/delivery/dues).
 *
 * Auth: uses the existing delivery-agent auth shape already used by the
 * /api/delivery/active and /api/delivery/earnings routes (the delivery staff
 * auth lives in /api/delivery/*, not a new server helper).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useTranslation } from "react-i18next";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";

interface DeliveryMine {
  delivery: {
    id: string;
    name: string;
    status: string;
    is_verified: boolean;
    logo_url: string | null;
  } | null;
  role: "OWNER" | "MANAGER" | "STAFF" | null;
}

interface OpenBill {
  id: string;
  kind: string;
  amount_bdt: number;
  due_at: string | null;
  created_at: string;
}

interface Statement {
  state: "NO_PRODUCT" | "LAPSED" | "OWING" | "ACTIVE";
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

// `nav.<key>` is an OBJECT ({ label, count }) because the card renders both a
// label and a count from the same branch — a flat string at `nav.packages`
// would collide with `nav.packages.count` and one of the two lookups would
// always miss.
const SEGMENTS = [
  { key: "packages", labelKey: "delivery.staff.nav.packages.label", testID: "delivery-staff.nav.packages" },
  { key: "dues", labelKey: "delivery.staff.nav.dues.label", testID: "delivery-staff.nav.dues" },
] as const;

export default function DeliveryStaffDashboardScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const C = {
    bg: isDark ? colors.bgDark : colors.bgLight,
    text: isDark ? colors.textPrimaryDark : colors.textPrimaryLight,
    sub: isDark ? colors.textSecondaryDark : colors.textSecondaryLight,
    surface: isDark ? colors.surfaceElevatedDark : colors.surfaceLight,
    border: isDark ? colors.borderDark : colors.borderLight,
  };

  const [_mine, _setMine] = useState<DeliveryMine | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const memoizedStatement = useMemo(() => statement, [statement]);

  const load = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;

      const mineRes = await fetch(`${API_URL}/api/delivery/mine`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mineRes.ok) {
        _setMine({ delivery: null, role: null });
      } else {
        const data = (await mineRes.json()) as DeliveryMine;
        _setMine(data);
      }
    } catch (e) {
      logger.error("[delivery-staff] mine load failed", e);
      _setMine({ delivery: null, role: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatement = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/delivery/dues`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = (await res.json()) as Statement & { message?: string };
        setStatement(data);
      } else {
        setStatement(null);
      }
    } catch (e) {
      logger.error("[delivery-staff] statement load failed", e);
      setStatement(null);
    }
  }, []);

  const _onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    await loadStatement();
    setRefreshing(false);
  }, [load, loadStatement]);

  useFocusEffect(
    useCallback(() => {
      void load();
      void loadStatement();
      const id = setInterval(() => {
        void loadStatement();
      }, 60_000);
      return () => clearInterval(id);
    }, [load, loadStatement]),
  );

  useEffect(() => {
    void load();
    void loadStatement();
  }, [load, loadStatement]);

  const stateKey = (memoizedStatement?.state ?? "NO_PRODUCT").toLowerCase();
  const bannerColor =
    memoizedStatement?.state === "OWING"
      ? colors.amber
      : memoizedStatement?.state === "ACTIVE"
        ? colors.success
        : colors.danger;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: C.bg }}>
      <View className="flex-row items-center px-5 py-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1"
         
         testID="delivery-staff.el-1">
          <Ionicons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text className="text-[17px] font-JakartaBold ml-3" style={{ color: C.text }}>
          {t("delivery.staff.title")}
        </Text>
      </View>

      {loading && !refreshing ? (
        <ActivityIndicator className="mt-10" color={colors.primary} />
      ) : (
        <ScrollView className="flex-1 px-5 pb-6">
          {/* Monetization state banner — same shape as shop/fleet hub. */}
          <View
            className="mt-5 mb-4 rounded-2xl p-4"
            style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
          >
            <Text className="text-[12px] font-JakartaBold" style={{ color: C.sub }}>
              {t("delivery.staff.state.label")}
            </Text>
            <Text className="text-[22px] font-JakartaBold mt-1" style={{ color: bannerColor }}>
              {statement == null
                ? t("delivery.staff.state.unknown")
                : t(`delivery.staff.state.${stateKey}`)}
            </Text>
            {memoizedStatement?.state === "ACTIVE" && memoizedStatement?.active_package != null ? (
              <Text className="text-[13px] mt-2" style={{ color: C.sub }}>
                {t("delivery.staff.state.active_package", {
                  name: memoizedStatement.active_package.name ?? t("common.unnamed"),
                })}
              </Text>
            ) : null}
          </View>

          {/* Nav cards */}
          {SEGMENTS.map((seg) => (
            <TouchableOpacity
              key={seg.key}
              className="mt-4 rounded-2xl p-4"
              style={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}
              onPress={() => router.push(`/(main)/(delivery-staff)/${seg.key}`)}
             
             testID="delivery-staff.push-delivery-staff">
              <Text className="text-[13px] font-JakartaBold" style={{ color: C.sub }}>
                {t(seg.labelKey)}
              </Text>
              <Text className="text-[22px] font-JakartaBold mt-1" style={{ color: C.text }}>
                {t(`delivery.staff.nav.${seg.key}.count`)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
