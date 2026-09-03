import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { formatBDT } from "@/lib/format";
import Badge from "@/components/Badge";
import { useTranslation } from "react-i18next";

interface Trip {
  id: string;
  origin: { address: string; latitude: string; longitude: string };
  destination: { address: string; latitude: string; longitude: string };
  vehicle_type: string;
  status: string;
  distance_km: number;
  fare_bdt: number;
  tip_bdt: number;
  completed_at: string | null;
  created_at: string;
  rider: { name: string | null; rating: number | null };
}

interface Pagination {
  page: number;
  total: number;
  total_pages: number;
  has_next: boolean;
}

type FilterStatus = "all" | "completed" | "cancelled" | "in_progress";

const STATUS_FILTERS: { key: FilterStatus; label: string }[] = [    { key: "all", label: "activity.all" },
  { key: "completed", label: "activity.completed" },
  { key: "cancelled", label: "activity.cancelled" },
];

const STATUS_BADGE_VARIANTS: Record<string, "success" | "danger" | "info" | "amber" | "primary" | "neutral"> = {
  completed: "success",
  cancelled: "danger",
  in_progress: "info",
  matched: "amber",
  expired: "neutral",
};

export default function ActivityScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [page, setPage] = useState(1);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchTrips = useCallback(
    async (pageNum: number, status: FilterStatus, isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setError(t('activity.not_authenticated'));
          return;
        }
        const params = new URLSearchParams({
          page: String(pageNum),
          status,
        });
        const res = await fetch(`${API_URL}/api/driver/trips?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setError(t('activity.failed_to_load'));
          return;
        }
        const data = await res.json();
        if (pageNum === 1) {
          setTrips(data.trips ?? []);
        } else {
          setTrips((prev) => [...prev, ...(data.trips ?? [])]);
        }
        setPagination(data.pagination ?? null);
      } catch (e) {
        logger.error("[activity] fetch trips failed", e);
        setError(t('activity.could_not_load'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    setPage(1);
    fetchTrips(1, filter);
  }, [filter, fetchTrips]);

  const handleRefresh = useCallback(() => {
    setPage(1);
    fetchTrips(1, filter, true);
  }, [filter, fetchTrips]);

  const loadMore = useCallback(() => {
    if (pagination?.has_next && !loading) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchTrips(nextPage, filter);
    }
  }, [pagination, loading, page, filter, fetchTrips]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-BD", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Dhaka",
    });
  };

  const shortcutMenu = [
    { label: "Call Ledger", route: "/(main)/(rider)/call-ledger", icon: "receipt-outline" as const },
    { label: "Due Amounts", route: "/(main)/(rider)/due-amounts", icon: "card-outline" as const },
    { label: "Schedule", route: "/(main)/(rider)/schedule", icon: "calendar-outline" as const },
  ] as const;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="px-[24px] py-[16px] border-b"
        style={{ borderColor }}
      >
        <Text
          className="text-[20px] font-JakartaBold tracking-tight"
          style={{ color: textPrimary }}
        >
          Activity
        </Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingVertical: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[colors.primary]} />
        }
      >
        {/* Quick links */}
        <View className="px-[24px] mb-3">
          <View
            className="flex-row rounded-[12px] overflow-hidden"
            style={{ borderWidth: 1, borderColor }}
          >
            {shortcutMenu.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                className="flex-1 items-center py-[12px]"
                style={{
                  backgroundColor: surfaceBg,
                  borderRightWidth: i < shortcutMenu.length - 1 ? 1 : 0,
                  borderColor,
                }}
                onPress={() => router.push(item.route)}
              >
                <Ionicons name={item.icon} size={20} color={colors.primary} />
                <Text
                  className="text-[11px] font-JakartaSemiBold mt-1"
                  style={{ color: textPrimary }}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-[24px] mb-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {STATUS_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setFilter(f.key)}
                className="px-[14px] py-[7px] rounded-full"
                style={{
                  backgroundColor: active ? colors.primary : surfaceBg,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : borderColor,
                }}
              >
                <Text
                  className="text-[13px] font-JakartaSemiBold"
                  style={{ color: active ? colors.white : textPrimary }}
                >
                  {t(f.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Trip list */}
        {loading && trips.length === 0 ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={{ marginTop: 40 }}
          />
        ) : error ? (
          <View className="mx-[24px] p-[14px] rounded-[12px]" style={{ backgroundColor: `${colors.danger}14` }}>
            <Text className="text-[14px] font-Jakarta" style={{ color: colors.danger }}>
              {error}
            </Text>
            <TouchableOpacity onPress={handleRefresh} className="mt-2">
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>
                {t('activity.retry')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : trips.length === 0 ? (
          <View className="items-center py-[40px] px-[24px]">
            <Ionicons name="car-outline" size={40} color={textSecondary} />
            <Text
              className="text-[15px] font-Jakarta mt-3 text-center"
              style={{ color: textSecondary }}
            >
              {t('activity.no_trips')}
            </Text>
            <Text
              className="text-[13px] font-Jakarta mt-1 text-center"
              style={{ color: textSecondary }}
            >
              {t('activity.ride_history_placeholder')}
            </Text>
          </View>
        ) : (
          <View className="px-[24px]" style={{ gap: 8 }}>
            {trips.map((trip) => (
              <View
                key={trip.id}
                className="rounded-[12px] p-[14px]"
                style={{
                  backgroundColor: surfaceBg,
                  borderWidth: 1,
                  borderColor,
                }}
              >
                {/* Status + date */}
                <View className="flex-row justify-between items-center mb-2">
                  <Badge
                    text={trip.status.replace(/_/g, " ").toUpperCase()}
                    variant={STATUS_BADGE_VARIANTS[trip.status] ?? "neutral"}
                  />
                  <Text
                    className="text-[11px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    {formatDate(trip.created_at)}
                  </Text>
                </View>

                {/* Route */}
                <View className="mb-2">
                  <View className="flex-row items-center gap-2 mb-1">
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.primary,
                      }}
                    />
                    <Text
                      className="text-[13px] font-Jakarta flex-1"
                      style={{ color: textPrimary }}
                      numberOfLines={1}
                    >
                      {trip.origin.address || t('activity.pickup')}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.danger,
                      }}
                    />
                    <Text
                      className="text-[13px] font-Jakarta flex-1"
                      style={{ color: textPrimary }}
                      numberOfLines={1}
                    >
                      {trip.destination.address || t('activity.drop_off')}
                    </Text>
                  </View>
                </View>

                {/* Bottom row: distance, fare, rider */}
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    <Text
                      className="text-[12px] font-Jakarta"
                      style={{ color: textSecondary }}
                    >
                      {trip.distance_km.toFixed(1)} km
                    </Text>
                    {trip.rider.name ? (
                      <Text
                        className="text-[12px] font-Jakarta"
                        style={{ color: textSecondary }}
                      >
                        {trip.rider.name}
                      </Text>
                    ) : null}
                  </View>
                  {trip.status === "completed" ? (
                    <View className="items-end">
                      <Text
                        className="text-[14px] font-JakartaBold"
                        style={{ color: colors.primary }}
                      >
                        {formatBDT(trip.fare_bdt + trip.tip_bdt)}
                      </Text>
                      {trip.tip_bdt > 0 && (
                        <Text
                          className="text-[11px] font-Jakarta"
                          style={{ color: textSecondary }}
                        >
                          {t('activity.incl_tip', { amount: formatBDT(trip.tip_bdt) })}
                        </Text>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            ))}

            {/* Load more */}
            {pagination?.has_next && (
              <TouchableOpacity
                className="py-[12px] items-center rounded-[12px] mb-2"
                style={{
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: surfaceBg,
                }}
                onPress={loadMore}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text
                    className="text-[14px] font-JakartaSemiBold"
                    style={{ color: colors.primary }}
                  >
                    {t('activity.load_more')}
                  </Text>
                )}
              </TouchableOpacity>
            )}

            {/* Page info */}
            {pagination && (
              <Text
                className="text-center text-[12px] font-Jakarta pb-2"
                style={{ color: textSecondary }}
              >
                {t('activity.showing_of', { count: trips.length, total: pagination.total })}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
