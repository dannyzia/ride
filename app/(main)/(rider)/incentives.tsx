import { colors, spacing, radii } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface ActiveIncentive {
  incentive_id: string;
  name: string;
  description: string | null;
  target_metric: string;
  target_value: number;
  current_progress: number;
  reward_calls: number;
  ends_at: string;
}

interface CompletedIncentive {
  incentive_id: string;
  name: string;
  completed_at: string | null;
  reward_calls: number;
}

interface IncentiveData {
  active: ActiveIncentive[];
  completed: CompletedIncentive[];
  total_bonus_calls_earned: number;
}

type IncentiveRow =
  | { key: "summary" }
  | { key: "completed-header" }
  | ({ key: "active" } & ActiveIncentive)
  | ({ key: "completed" } & CompletedIncentive);

function formatMetric(metric: string): string {
  switch (metric) {
    case "completed_rides":
      return "rides";
    case "online_hours":
      return "hours";
    case "acceptance_rate":
      return "%";
    case "consecutive_accepts":
      return "accepts";
    default:
      return metric;
  }
}

function formatMetricLabel(metric: string): string {
  switch (metric) {
    case "completed_rides":
      return "Completed Rides";
    case "online_hours":
      return "Online Hours";
    case "acceptance_rate":
      return "Acceptance Rate";
    case "consecutive_accepts":
      return "Consecutive Accepts";
    default:
      return metric;
  }
}

function getProgressPercent(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

export default function IncentivesScreen() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const textDisabled = isDark
    ? colors.textDisabledDark
    : colors.textDisabledLight;

  const [data, setData] = useState<IncentiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchIncentives = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      // This endpoint is JWT-gated — without the Authorization header every
      // request 401'd and the screen stayed null forever.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(`${API_URL}/api/driver/incentives`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Network failure — data stays null and the empty state offers retry
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchIncentives();
  }, [fetchIncentives]);

  const onRefresh = useCallback(() => fetchIncentives(true), [fetchIncentives]);

  const renderActiveIncentive = ({ item }: { item: ActiveIncentive }) => {
    const pct = getProgressPercent(item.current_progress, item.target_value);
    const endsAt = new Date(item.ends_at);
    const daysLeft = Math.max(
      0,
      Math.ceil((endsAt.getTime() - Date.now()) / 86400_000),
    );
    const metricLabel = formatMetric(item.target_metric);

    return (
      <View
        style={{
          backgroundColor: surfaceBg,
          borderRadius: radii.xl,
          padding: spacing.lg,
          marginBottom: spacing.md,
          borderLeftWidth: 4,
          borderLeftColor: colors.primary,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: spacing.sm,
          }}
        >
          <View style={{ flex: 1, marginRight: spacing.sm }}>
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontWeight: "700",
                fontSize: 16,
                color: textPrimary,
              }}
            >
              {item.name}
            </Text>
            {item.description && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 12,
                  color: textSecondary,
                  marginTop: 2,
                }}
              >
                {item.description}
              </Text>
            )}
          </View>
          <View
            style={{
              backgroundColor: isDark
                ? colors.primaryLightDark
                : colors.primaryLight,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 4,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 11,
                fontWeight: "700",
                color: colors.primary,
              }}
            >
              +{item.reward_calls} calls
            </Text>
          </View>
        </View>

        {/* Progress */}
        <View style={{ marginBottom: spacing.sm }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginBottom: spacing.xs,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 12,
                color: textSecondary,
              }}
            >
              {formatMetricLabel(item.target_metric)}
            </Text>
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 12,
                fontWeight: "600",
                color: textPrimary,
              }}
            >
              <Text style={{ color: colors.primary }}>
                {item.current_progress}
              </Text>
              {" / "}
              {item.target_value} {metricLabel}
            </Text>
          </View>
          {/* Progress bar */}
          <View
            style={{
              height: 8,
              backgroundColor: borderColor,
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                width: `${pct}%`,
                backgroundColor: pct >= 100 ? colors.primary : colors.info,
                borderRadius: 4,
              }}
            />
          </View>
        </View>

        {/* Footer */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 11,
              color: textDisabled,
            }}
          >
            {daysLeft > 0 ? `${daysLeft} days left` : "Ending soon"}
          </Text>
          {pct >= 100 && (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={colors.primary}
              />
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 11,
                  fontWeight: "600",
                  color: colors.primary,
                  marginLeft: 2,
                }}
              >
                Completed!
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderCompletedIncentive = ({ item }: { item: CompletedIncentive }) => (
    <View
      style={{
        backgroundColor: surfaceBg,
        borderRadius: radii.lg,
        padding: spacing.md,
        marginBottom: spacing.sm,
        flexDirection: "row",
        alignItems: "center",
        opacity: 0.8,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: colors.primary + "20",
          alignItems: "center",
          justifyContent: "center",
          marginRight: spacing.sm,
        }}
      >
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "600",
            fontSize: 14,
            color: textPrimary,
          }}
        >
          {item.name}
        </Text>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontSize: 11,
            color: textSecondary,
          }}
        >
          {item.completed_at
            ? `Completed ${new Date(item.completed_at).toLocaleDateString("en-GB")}`
            : "Completed"}
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Jakarta-Bold",
          fontSize: 13,
          fontWeight: "700",
          color: colors.primary,
        }}
      >
        +{item.reward_calls} calls
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: "Jakarta-Regular",
            fontWeight: "700",
            fontSize: 17,
            color: textPrimary,
          }}
        >
          Incentives
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !data ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: spacing["3xl"],
          }}
        >
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textSecondary,
              textAlign: "center",
            }}
          >
            Could not load incentives. Pull to refresh.
          </Text>
        </View>
      ) : (
        <FlatList
          data={[
            { key: "summary" },
            ...data.active.map((a) => ({ key: "active" as const, ...a })),
            ...(data.completed.length > 0
              ? [{ key: "completed-header" as const }]
              : []),
            ...data.completed.map((c) => ({ key: "completed" as const, ...c })),
          ] as IncentiveRow[]}
          keyExtractor={(item) =>
            item.key === "active"
              ? `active-${item.incentive_id}`
              : item.key === "completed"
                ? `completed-${item.incentive_id}`
                : item.key
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: spacing["3xl"],
          }}
          renderItem={({ item }: { item: IncentiveRow }) => {
            if (item.key === "summary") {
              return (
                <View
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: radii.xl,
                    padding: spacing.lg,
                    marginBottom: spacing.lg,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontWeight: "700",
                      fontSize: 15,
                      color: colors.white,
                      marginBottom: spacing.xs,
                    }}
                  >
                    Total Bonus Earned
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Jakarta-Regular",
                      fontWeight: "700",
                      fontSize: 32,
                      color: colors.white,
                    }}
                  >
                    {data.total_bonus_calls_earned} calls
                  </Text>
                </View>
              );
            }
            if (item.key === "completed-header") {
              return (
                <Text
                style={{
                fontFamily: "Jakarta-Regular",
                fontWeight: "700",
                fontSize: 15,
                color: textSecondary,
                marginTop: spacing.md,
                marginBottom: spacing.sm,
                }}
                >
                Completed
                </Text>
              );
            }
            if (item.key === "active") {
              return renderActiveIncentive({ item });
            }
            if (item.key === "completed") {
              return renderCompletedIncentive({ item });
            }
            return null;
          }}
          ListEmptyComponent={
            <View
              style={{ alignItems: "center", paddingVertical: spacing["3xl"] }}
            >
              <Ionicons
                name="gift-outline"
                size={48}
                color={textDisabled}
              />
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontWeight: "600",
                  fontSize: 16,
                  color: textSecondary,
                  marginTop: spacing.md,
                }}
              >
                No active incentives
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textDisabled,
                  marginTop: spacing.sm,
                  textAlign: "center",
                }}
              >
                Active campaigns will appear here. Complete rides to earn bonus
                calls!
              </Text>
            </View>
          }
        />
      )}

      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
