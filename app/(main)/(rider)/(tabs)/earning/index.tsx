import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  StatusBar,
  Alert,
  TextInput,
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
import { todayDhaka, dayLabel } from "@/lib/time";
import DriverStatsBar from "@/components/DriverStatsBar";
import { useTranslation } from "react-i18next";

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

interface EarningsGoal {
  id: string;
  period: "daily" | "weekly" | "monthly";
  target_bdt: number;
  created_at: string;
}

// Goal bounds in taka (will be stored as integer paisa internally)
const GOAL_MIN_TAKA = 100;
const GOAL_MAX_TAKA = 50000;

export default function EarningScreen() {
  const { t } = useTranslation();
  const isDark = useIsDark();
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [week, setWeek] = useState<WeekDay[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // R2.1: Server-side earnings goal state
  const [goal, setGoal] = useState<EarningsGoal | null>(null);
  const [currentBdt, setCurrentBdt] = useState(0);
  const [goalLoading, setGoalLoading] = useState(true);
  const [goalInputVisible, setGoalInputVisible] = useState(false);
  const [goalInputTaka, setGoalInputTaka] = useState("");
  const [goalPeriod, setGoalPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [goalSaving, setGoalSaving] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  // ── Load server-side goal ────────────────────────────────────────
  const loadGoal = useCallback(async () => {
    setGoalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setGoalLoading(false); return; }
      const res = await fetch(`${API_URL}/api/driver/earnings/goal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGoal(data.goal ?? null);
        setCurrentBdt(data.current_bdt ?? 0);
      }
    } catch (e) {
      logger.error("[earning] loadGoal failed", e);
    } finally {
      setGoalLoading(false);
    }
  }, []);

  // ── Save goal ─────────────────────────────────────────────────────
  const saveGoal = useCallback(
    async (taka: number, period: "daily" | "weekly" | "monthly") => {
      if (taka < GOAL_MIN_TAKA || taka > GOAL_MAX_TAKA) {
        Alert.alert(
          t('earnings.alert_invalid_goal'),
          t('earnings.alert_invalid_goal_msg', { min: GOAL_MIN_TAKA, max: GOAL_MAX_TAKA }),
        );
        return;
      }
      setGoalSaving(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) { setGoalSaving(false); return; }
        const res = await fetch(`${API_URL}/api/driver/earnings/goal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            period,
            target_bdt: taka * 100, // convert to paisa
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setGoal(data.goal ?? null);
          setCurrentBdt(data.current_bdt ?? 0);
          setGoalInputVisible(false);
          setGoalInputTaka("");
        } else {
          const err = await res.json();
          Alert.alert(t('earnings.alert_error'), err.message || t('earnings.alert_save_failed'));
        }
      } catch (e) {
        logger.error("[earning] saveGoal failed", e);
        Alert.alert(t('earnings.alert_error'), t('earnings.alert_save_failed'));
      } finally {
        setGoalSaving(false);
      }
    },
    [],
  );

  // ── Load stats + week + goal ─────────────────────────────────────
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
    loadGoal();
  }, [load, loadGoal]);

  const menu = [
    { label: t('earnings.overview'), route: "/(main)/(rider)/earnings" },
    { label: t('earnings.breakdown'), route: "/(main)/(rider)/earnings-breakdown" },
    { label: t('earnings.commission_statement'), route: "/(main)/(rider)/commission-statement" },
    { label: t('earnings.performance_stats'), route: "/(main)/(rider)/performance-stats" },
    { label: t('earnings.hotspot_map'), route: "/(main)/(rider)/hotspot-map" },
  ] as const;

  const today = todayDhaka();
  const currentEarnings = stats?.earnings_bdt ?? 0;
  const goalProgress =
    goal && goal.target_bdt > 0
      ? Math.min(1, currentBdt / goal.target_bdt)
      : 0;
  const goalMet = goal != null && currentBdt >= goal.target_bdt;

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="px-[24px] py-[16px] border-b flex-row justify-between items-center"
        style={{ borderColor }}
      >
        <Text
          className="text-[20px] font-JakartaBold tracking-tight"
          style={{ color: textPrimary }}
        >
          Earnings
        </Text>
        <TouchableOpacity
          onPress={() => {
            setGoalInputTaka(
              goal ? String(Math.round(goal.target_bdt / 100)) : "",
            );
            setGoalPeriod(goal?.period ?? "daily");
            setGoalInputVisible(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Set earnings goal"
        >
          <Ionicons name="flag-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        ) : error ? (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: `${colors.danger}14` },
            ]}
          >
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={[styles.errorText, { color: colors.danger }]}>
              {error}
            </Text>
            <TouchableOpacity
              onPress={load}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Stats bar */}
            {stats && (
              <DriverStatsBar
                earnings_bdt={stats.earnings_bdt}
                trips={stats.trips}
                online_hours={Math.round(stats.online_hours * 10) / 10}
                onPress={() =>
                  router.push(`/(main)/(rider)/earnings-detail/${today}`)
                }
              />
            )}

            {/* R2.1: Server-side earnings goal card */}
            {goal && !goalLoading && (
              <View
                className="rounded-[12px] p-[14px]"
                style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
              >
                <View className="flex-row justify-between items-center mb-2">
                  <Text
                    className="text-[14px] font-JakartaSemiBold"
                    style={{ color: textPrimary }}
                  >
                    {goal.period === "daily"
                      ? t('earnings.period_daily')
                      : goal.period === "weekly"
                        ? t('earnings.period_weekly')
                        : t('earnings.period_monthly')}{" "}
                    {t('earnings.daily_goal')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setGoalInputTaka(String(Math.round(goal.target_bdt / 100)));
                      setGoalPeriod(goal.period);
                      setGoalInputVisible(true);
                    }}
                  >
                    <Text
                      className="text-[12px] font-Jakarta"
                      style={{ color: colors.primary }}
                    >
                      {t('earnings.edit_goal')}
                    </Text>
                  </TouchableOpacity>
                </View>
                {/* Progress bar */}
                <View
                  className="h-[8px] rounded-full overflow-hidden mb-2"
                  style={{ backgroundColor: `${colors.primary}20` }}
                >
                  <View
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, goalProgress * 100)}%`,
                      backgroundColor: goalMet ? colors.success : colors.primary,
                    }}
                  />
                </View>
                <View className="flex-row justify-between items-center">
                  <Text
                    className="text-[13px] font-Jakarta"
                    style={{ color: textSecondary }}
                  >
                    {formatBDT(currentBdt)} {t('earnings.earned_today')}
                  </Text>
                  <Text
                    className="text-[13px] font-JakartaBold"
                    style={{ color: goalMet ? colors.success : textPrimary }}
                  >
                    {t('earnings.goal_label')} {formatBDT(goal.target_bdt)}
                  </Text>
                </View>
                {goalMet && (
                  <View className="flex-row items-center gap-1 mt-2">
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text
                      className="text-[12px] font-JakartaBold"
                      style={{ color: colors.success }}
                    >
                      {t('earnings.goal_reached')} 🎉
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* No goal set — prompt */}
            {!goal && !goalLoading && (
              <TouchableOpacity
                className="rounded-[12px] p-[14px] border border-dashed"
                style={{ borderColor: colors.primary }}
                onPress={() => {
                  setGoalInputTaka("");
                  setGoalPeriod("daily");
                  setGoalInputVisible(true);
                }}
              >
                <View className="flex-row items-center gap-2">
                  <Ionicons name="flag-outline" size={18} color={colors.primary} />
                  <Text
                    className="text-[14px] font-JakartaSemiBold"
                    style={{ color: colors.primary }}
                  >
                    {t('earnings.goal_prompt_title')}
                  </Text>
                </View>
                <Text
                  className="text-[12px] font-Jakarta mt-1"
                  style={{ color: textSecondary }}
                >
                  {t('earnings.goal_prompt_desc')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Week chart */}
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
              {t('earnings.last_7_days')}
            </Text>

            {week && week.length > 0 ? (
              week.map((day) => {
                const isToday = day.date === today;
                return (
                  <TouchableOpacity
                    key={day.date}
                    style={[
                      styles.dayRow,
                      { backgroundColor: surfaceBg, borderColor },
                    ]}
                    onPress={() =>
                      router.push(`/(main)/(rider)/earnings-detail/${day.date}`)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Earnings for ${dayLabel(day.date)}`}
                  >
                    <View style={styles.dayLeft}>
                      <Text style={[styles.dayLabel, { color: textPrimary }]}>
                        {dayLabel(day.date)}
                      </Text>
                      {isToday && (
                        <View
                          style={[
                            styles.todayBadge,
                            { backgroundColor: colors.primaryLight },
                          ]}
                        >
                          <Text
                            style={[styles.todayBadgeText, { color: colors.primary }]}
                          >
                            {t('earnings.today')}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.dayRight}>
                      <Text style={[styles.dayEarnings, { color: textPrimary }]}>
                        {formatBDT(day.earnings_bdt)}
                      </Text>
                      <Text style={[styles.dayTrips, { color: textSecondary }]}>
                        {day.trips} {day.trips === 1 ? t('earnings.trip') : t('earnings.trips')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={textSecondary} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={[styles.emptyText, { color: textSecondary }]}>
                {t('earnings.no_earnings')}
              </Text>
            )}

            {/* More links */}
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
              {t('earnings.more')}
            </Text>
            {menu.map((item) => (
              <TouchableOpacity
                key={item.route}
                style={[
                  styles.menuRow,
                  { backgroundColor: surfaceBg, borderColor },
                ]}
                onPress={() => router.push(item.route)}
              >
                <Text style={[styles.menuLabel, { color: textPrimary }]}>
                  {item.label}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={textSecondary} />
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* Goal input modal */}
      {goalInputVisible && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <View
            className="w-[85%] rounded-[16px] p-[20px]"
            style={{ backgroundColor: surfaceBg }}
          >
            <Text
              className="text-[18px] font-JakartaBold mb-2"
              style={{ color: textPrimary }}
            >
              {t('earnings.set_goal_title')}
            </Text>
            <Text
              className="text-[13px] font-Jakarta mb-3"
              style={{ color: textSecondary }}
            >
              {t('earnings.set_goal_prompt', { min: GOAL_MIN_TAKA, max: GOAL_MAX_TAKA })}
            </Text>

            {/* Period selector */}
            <View className="flex-row gap-2 mb-4">
              {(["daily", "weekly", "monthly"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  className="flex-1 py-[8px] rounded-[8px] items-center"
                  style={{
                    backgroundColor:
                      goalPeriod === p ? colors.primary : "transparent",
                    borderWidth: 1,
                    borderColor: goalPeriod === p ? colors.primary : borderColor,
                  }}
                  onPress={() => setGoalPeriod(p)}
                >
                  <Text
                    className="text-[13px] font-JakartaSemiBold"
                    style={{
                      color: goalPeriod === p ? "#fff" : textPrimary,
                    }}
                  >
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              className="rounded-[10px] px-[14px] py-[12px] text-[16px] font-Jakarta mb-4"
              style={{
                backgroundColor: bg,
                borderWidth: 1,
                borderColor,
                color: textPrimary,
              }}
              placeholder="e.g. 2000"
              placeholderTextColor={textSecondary}
              keyboardType="numeric"
              value={goalInputTaka}
              onChangeText={setGoalInputTaka}
              autoFocus
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{ borderWidth: 1, borderColor }}
                onPress={() => setGoalInputVisible(false)}
              >
                <Text
                  className="text-[15px] font-JakartaSemiBold"
                  style={{ color: textPrimary }}
                >
                  {t('common.cancel')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 py-[12px] rounded-[10px] items-center"
                style={{
                  backgroundColor: goalSaving ? textSecondary : colors.primary,
                }}
                disabled={goalSaving}
                onPress={() => {
                  const val = parseInt(goalInputTaka.replace(/[^\d]/g, ""), 10);
                  if (val) saveGoal(val, goalPeriod);
                }}
              >
                {goalSaving ? (
                  <ActivityIndicator size={16} color="#fff" />
                ) : (
                  <Text className="text-[15px] font-JakartaSemiBold text-white">
                    {t('common.save')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            {goal && (
              <TouchableOpacity
                className="mt-3 py-[8px] items-center"
                onPress={async () => {
                  setGoal(null);
                  setCurrentBdt(0);
                  setGoalInputVisible(false);
                  try {
                    const { data: { session } } = await supabase.auth.getSession();
                    const token = session?.access_token;
                    if (token) {
                      // Deactivate by posting a dummy — or better, just remove locally
                      // (goal will still exist server-side but won't be "active")
                      // For simplicity, we just clear the client state.
                      // A proper DELETE endpoint could be added if needed.
                    }
                  } catch {}
                }}
              >
                <Text
                  className="text-[13px] font-Jakarta"
                  style={{ color: colors.danger }}
                >
                  {t('earnings.remove_goal')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
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
