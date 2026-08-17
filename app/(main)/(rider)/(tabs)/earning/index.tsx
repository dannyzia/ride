import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { colors, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { formatBDT } from "@/lib/format";
import DriverStatsBar from "@/components/DriverStatsBar";

interface DailyStats {
  earnings_bdt: number;
  trips: number;
  online_hours: number;
}

interface WeekDay {
  date: string;
  earnings_bdt: number;
  trips: number;
}

interface WeekResponse {
  days: WeekDay[];
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// YYYY-MM-DD of "now" in Asia/Dhaka (en-CA yields ISO order). Matches the
// server's bdtDayBoundariesUtc bucketing.
const todayDhaka = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const dayLabel = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d)); // UTC — date parts only, no tz drift
  return `${WEEKDAY[dt.getUTCDay()]}, ${d} ${MONTH[m - 1]}`;
};

export default function EarningScreen() {
  const isDark = useIsDark();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [week, setWeek] = useState<WeekDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [statsRes, weekRes] = await Promise.all([
        fetch(`${API_URL}/api/driver/daily-stats`, { headers }),
        fetch(`${API_URL}/api/driver/earnings/weekly`, { headers }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (weekRes.ok) {
        const data: WeekResponse = await weekRes.json();
        setWeek(data.days ?? []);
      }
    } catch (e) {
      logger.error("[earning] load failed", e);
      setError("Could not load earnings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const menu = [
    { label: "Earnings Overview", route: "/(main)/(rider)/earnings" },
    { label: "Earnings Breakdown", route: "/(main)/(rider)/earnings-breakdown" },
    { label: "Commission Statement", route: "/(main)/(rider)/commission-statement" },
    { label: "Performance Stats", route: "/(main)/(rider)/performance-stats" },
  ] as const;

  const today = todayDhaka();

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <View className="px-[24px] py-[16px] border-b" style={{ borderColor }}>
        <Text className="text-[20px] font-JakartaBold tracking-tight" style={{ color: textPrimary }}>
          Earnings
        </Text>
      </View>
      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : error ? (
          <View style={[styles.errorBox, { backgroundColor: `${colors.danger}14` }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
            <TouchableOpacity onPress={load} accessibilityRole="button" accessibilityLabel="Retry">
              <Text style={[styles.retryText, { color: colors.primary }]}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {stats && (
              <DriverStatsBar
                earnings_bdt={stats.earnings_bdt}
                trips={stats.trips}
                online_hours={Math.round(stats.online_hours * 10) / 10}
                onPress={() => router.push(`/(main)/(rider)/earnings-detail/${today}`)}
              />
            )}

            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Last 7 Days</Text>

            {week && week.length > 0 ? (
              week.map((day) => {
                const isToday = day.date === today;
                return (
                  <TouchableOpacity
                    key={day.date}
                    style={[styles.dayRow, { backgroundColor: surfaceBg, borderColor }]}
                    onPress={() => router.push(`/(main)/(rider)/earnings-detail/${day.date}`)}
                    accessibilityRole="button"
                    accessibilityLabel={`Earnings for ${dayLabel(day.date)}`}
                  >
                    <View style={styles.dayLeft}>
                      <Text style={[styles.dayLabel, { color: textPrimary }]}>
                        {dayLabel(day.date)}
                      </Text>
                      {isToday && (
                        <View style={[styles.todayBadge, { backgroundColor: colors.primaryLight }]}>
                          <Text style={[styles.todayBadgeText, { color: colors.primary }]}>Today</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.dayRight}>
                      <Text style={[styles.dayEarnings, { color: textPrimary }]}>
                        {formatBDT(day.earnings_bdt)}
                      </Text>
                      <Text style={[styles.dayTrips, { color: textSecondary }]}>
                        {day.trips} {day.trips === 1 ? "trip" : "trips"}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={textSecondary} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                No completed trips in the last 7 days.
              </Text>
            )}

            <Text style={[styles.sectionTitle, { color: textPrimary }]}>More</Text>
            {menu.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[styles.menuRow, { backgroundColor: surfaceBg, borderColor }]}
                onPress={() => router.push(item.route)}
              >
                <Text style={[styles.menuLabel, { color: textPrimary }]}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={textSecondary} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: 16,
    gap: 12,
  },
  loader: {
    marginTop: 40,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    flex: 1,
  },
  retryText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
  },
  sectionTitle: {
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    marginTop: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: 8,
  },
  dayLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dayLabel: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
  todayBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  todayBadgeText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 11,
  },
  dayRight: {
    alignItems: "flex-end",
  },
  dayEarnings: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    fontVariant: ["tabular-nums"],
  },
  dayTrips: {
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  emptyText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    paddingVertical: 8,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  menuLabel: {
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
});
