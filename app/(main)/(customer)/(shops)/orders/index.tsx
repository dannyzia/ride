/**
 * My orders list (F-11 tracking entry — plan 27 §5).
 *
 * GET /api/shop/my-orders — the caller's own orders across every shop, newest
 * first. Tap → the tracking screen. Partial orders (out-of-stock at accept)
 * carry a badge so the confirm affordance is discoverable from the list.
 */
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useIsDark } from "@/lib/useAppearance";
import { colors } from "@/theme/goRide";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useTranslation } from "react-i18next";
import { formatBDT } from "@/lib/format";

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? "http://localhost:8080";

interface MyOrderRow {
  id: string;
  shop_id: string;
  shop_name: string;
  status: string;
  fulfillment: string;
  subtotal_bdt: number;
  delivery_fee_bdt: number | null;
  total_bdt: number;
  unavailable_item_ids: string[] | null;
  created_at: string;
}

export default function MyOrdersScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const [orders, setOrders] = useState<MyOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(true);
        return;
      }
      const res = await fetch(`${SERVER_URL}/api/shop/my-orders`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setOrders(body.orders ?? []);
      setError(false);
    } catch (err) {
      logger.error("[my-orders] fetch error", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders(true);
    setRefreshing(false);
  };

  const isCancelled = (status: string) => status === "cancelled" || status === "refunded";
  const isDone = (status: string) =>
    ["delivered", "self_delivered", "done"].includes(status);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 }}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} testID="customer.shops.orders.el-1">
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={{ flex: 1, fontSize: 20, fontFamily: "JakartaBold", color: textPrimary, marginLeft: 12 }}>
          {t("shops_track.my_orders")}
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 15, fontFamily: "JakartaMedium", color: textSecondary, textAlign: "center" }}>
            {t("shops_track.load_error")}
          </Text>
          <TouchableOpacity
            onPress={() => fetchOrders()}
            style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
           testID="customer.shops.orders.fetch-orders">
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontFamily: "JakartaSemiBold" }}>{t("shops_track.retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : orders.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Ionicons name="receipt-outline" size={44} color={textSecondary} />
          <Text style={{ fontSize: 16, fontFamily: "JakartaSemiBold", color: textPrimary, marginTop: 12, textAlign: "center" }}>
            {t("shops_track.empty_title")}
          </Text>
          <Text style={{ fontSize: 14, fontFamily: "JakartaMedium", color: textSecondary, marginTop: 6, textAlign: "center" }}>
            {t("shops_track.empty_body")}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 20 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {orders.map((order) => {
            const partialPending =
              (order.unavailable_item_ids?.length ?? 0) > 0 && !isDone(order.status);
            return (
              <TouchableOpacity
                key={order.id}
                onPress={() => router.push(`/(main)/(customer)/(shops)/orders/${order.id}`)}
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                }}
               testID="customer.shops.orders.push-orders">
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: "JakartaSemiBold", color: textPrimary }} numberOfLines={1}>
                    {order.shop_name}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={textSecondary} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      backgroundColor: isCancelled(order.status)
                        ? colors.dangerLight
                        : isDone(order.status)
                          ? "#E6F4EA"
                          : borderColor,
                      marginRight: 8,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "JakartaSemiBold",
                        color: isCancelled(order.status)
                          ? colors.danger
                          : isDone(order.status)
                            ? colors.success
                            : colors.primary,
                      }}
                    >
                      {t(`shops_track.status_${order.status}`)}
                    </Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13, fontFamily: "JakartaMedium", color: textSecondary }}>
                    {new Date(order.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={{ fontSize: 15, fontFamily: "JakartaBold", color: colors.primary }}>
                    {formatBDT(order.total_bdt)}
                  </Text>
                </View>
                {partialPending && (
                  <Text style={{ fontSize: 12, fontFamily: "JakartaSemiBold", color: colors.primary, marginTop: 6 }}>
                    {t("shops_track.partial_title")}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
