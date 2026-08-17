import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors, radii } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { formatBDT } from "@/lib/format";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// YYYY-MM-DD of "now" in Asia/Dhaka — matches the server's day bucketing.
const todayDhaka = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

interface DaySummary {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
}

interface TripRow {
  ride_id: string;
  completed_at: string;
  driver_fare_bdt: number;
  origin_address: string | null;
  destination_address: string | null;
}

export default function EarningsDetail() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const validDate = typeof date === "string" && DATE_RE.test(date);

  const [summary, setSummary] = useState<DaySummary | null>(null);
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const load = useCallback(async () => {
    if (!validDate) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(true);
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, tripsRes] = await Promise.all([
        fetch(`${API_URL}/api/driver/daily-stats?date=${date}`, { headers }),
        fetch(`${API_URL}/api/driver/earnings/breakdown?date=${date}`, { headers }),
      ]);
      if (statsRes.ok) setSummary(await statsRes.json());
      if (tripsRes.ok) {
        const data = await tripsRes.json();
        setTrips(Array.isArray(data.trips) ? data.trips : []);
      }
    } catch (e) {
      logger.error("[earnings-detail] load failed", e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [validDate, date]);

  useEffect(() => {
    load();
  }, [load]);

  // "2026-08-17" → "Monday, 17 August 2026" via UTC date parts (no device-tz drift).
  let titleLabel = "Earnings";
  let isToday = false;
  if (validDate) {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    titleLabel = `${WEEKDAY[dt.getUTCDay()]}, ${d} ${MONTH[m - 1]} ${y}`;
    isToday = date === todayDhaka();
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>
          Earnings
        </Text>
        <TouchableOpacity
          onPress={() => setTheme(isDark ? "light" : "dark")}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>

      {!validDate ? (
        <View style={styles.centered}>
          <Ionicons name="calendar-outline" size={48} color={textDisabled} />
          <Text style={[styles.centeredText, { color: textSecondary }]}>
            Invalid date.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="warning-outline" size={48} color={colors.danger} />
          <Text style={[styles.centeredText, { color: textSecondary }]}>
            Could not load earnings.
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={load}
            accessibilityRole="button"
            accessibilityLabel="Retry"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.titleRow, { marginBottom: 12 }]}>
            <Text style={[styles.title, { color: textPrimary }]}>{titleLabel}</Text>
            {isToday && (
              <View style={[styles.todayBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.todayBadgeText, { color: colors.primary }]}>Today</Text>
              </View>
            )}
          </View>

          {/* Day summary */}
          <View style={[styles.summaryCard, { backgroundColor: surfaceBg, borderColor }]}>
            <Text style={[styles.summaryLabel, { color: textSecondary }]}>Total Earnings</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {formatBDT(summary?.earnings_bdt ?? 0)}
            </Text>
            <View style={[styles.summaryStatsRow, { borderTopColor: borderColor }]}>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: textPrimary }]}>
                  {summary?.trips ?? 0}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: textSecondary }]}>Trips</Text>
              </View>
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatValue, { color: textPrimary }]}>
                  {typeof summary?.online_hours === "number"
                    ? `${Math.round(summary.online_hours * 10) / 10}h`
                    : "—"}
                </Text>
                <Text style={[styles.summaryStatLabel, { color: textSecondary }]}>Online</Text>
              </View>
            </View>
          </View>

          {/* Trip list */}
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>Trips</Text>
          {trips && trips.length > 0 ? (
            trips.map((trip) => (
              <View
                key={trip.ride_id}
                style={[styles.tripRow, { backgroundColor: surfaceBg, borderColor }]}
              >
                <View style={styles.tripLeft}>
                  <Text style={[styles.tripTime, { color: textSecondary }]}>
                    {new Intl.DateTimeFormat("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Dhaka",
                    }).format(new Date(trip.completed_at))}
                  </Text>
                  <Text style={[styles.tripRoute, { color: textPrimary }]} numberOfLines={1}>
                    {trip.origin_address ?? "Pickup"} → {trip.destination_address ?? "Dropoff"}
                  </Text>
                </View>
                <Text style={[styles.tripEarnings, { color: textPrimary }]}>
                  {formatBDT(trip.driver_fare_bdt)}
                </Text>
              </View>
            ))
          ) : (
            <View style={[styles.emptyCard, { backgroundColor: surfaceBg, borderColor }]}>
              <Ionicons name="car-outline" size={32} color={textDisabled} />
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                No completed trips on this day.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    flex: 1,
    textAlign: "center",
    marginHorizontal: 8,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 12,
  },
  centeredText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: radii.pill,
  },
  retryBtnText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
    color: colors.white,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    flexShrink: 1,
  },
  todayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  todayBadgeText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 11,
  },
  summaryCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  summaryLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  summaryValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 32,
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  summaryStatsRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    marginTop: 14,
    paddingTop: 12,
    gap: 32,
  },
  summaryStat: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  summaryStatValue: {
    fontFamily: "Jakarta-Bold",
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  summaryStatLabel: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  sectionTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    marginBottom: 10,
  },
  tripRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  tripLeft: {
    flex: 1,
  },
  tripTime: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  tripRoute: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
    marginTop: 2,
  },
  tripEarnings: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  emptyCard: {
    alignItems: "center",
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingVertical: 32,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
});
