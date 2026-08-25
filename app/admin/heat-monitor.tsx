import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ZoneHeatRow {
  zone_id: string;
  zone_name: string;
  score: number;
  baseline_pct: number;
  live_pctile: number;
  live_ewma: number;
  tag: "hot" | "neutral" | "cold";
  idle_driver_count: number;
  suggest_score: number;
  computed_at: string;
}

interface HeatResponse {
  zones?: ZoneHeatRow[];
  backtest_correlation?: string | null;
}

const TAG_CHIP: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  hot: { label: "HOT", bg: "rgba(245, 158, 11, 0.15)", text: colors.amber },
  neutral: {
    label: "NEUTRAL",
    bg: "rgba(156, 163, 175, 0.12)",
    text: colors.textSecondaryDark,
  },
  cold: {
    label: "COLD",
    bg: "rgba(14, 165, 233, 0.12)",
    text: colors.accent,
  },
};

const AUTO_REFRESH_MS = 60_000;

export default function HeatMonitorScreen() {
  const toast = useAdminToast();
  const [zones, setZones] = useState<ZoneHeatRow[]>([]);
  const [backtestCorrelation, setBacktestCorrelation] = useState<string | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const { data, error, status } = await adminFetch<HeatResponse>(
        "/api/admin/heat-monitor",
        { method: "GET" },
      );
      if (error || !data) {
        if (status !== 0) {
          toast.show(
            `Failed to load heat data: ${error ?? "unknown"}`,
            "error",
          );
        }
      } else {
        setZones(data.zones ?? []);
        setBacktestCorrelation(data.backtest_correlation ?? null);
      }
      setLoading(false);
      setRefreshing(false);
    },
    [toast],
  );

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(() => fetchData(true), AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData]);

  const sortedZones = [...zones].sort((a, b) => b.suggest_score - a.suggest_score);

  const renderScoreBar = (score: number) => {
    const pct = Math.round(score * 100);
    const barColor =
      score >= 0.66
        ? colors.amber
        : score >= 0.33
          ? colors.textSecondaryDark
          : colors.accent;
    return (
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width: `${Math.min(pct, 100)}%`, backgroundColor: barColor },
          ]}
        />
      </View>
    );
  };

  return (
    <AdminShell
      title="Heat Monitor"
      subtitle="Live zone heat scores, baseline vs live, and idle driver density"
      actions={
        <Pressable
          style={[styles.ghostBtn, refreshing && styles.ghostBtnDisabled]}
          onPress={() => fetchData(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator color={colors.adminAccent} size="small" />
          ) : (
            <Text style={styles.ghostBtnText}>Refresh</Text>
          )}
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* Backtest correlation banner */}
          <View style={styles.bannerCard}>
            <Text style={styles.bannerLabel}>
              Heat Backtest Correlation (Stage 0 Exit Gate)
            </Text>
            <Text style={styles.bannerValue}>
              {backtestCorrelation !== null && backtestCorrelation !== ""
                ? backtestCorrelation
                : "Not yet computed — weekly backtest job has not run."}
            </Text>
            <Text style={styles.bannerHint}>
              A meaningfully positive correlation is required before enabling
              rider-facing pickup fees (Stage 1).
            </Text>
          </View>

          {/* Zone heat table */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Zone Heat Scores</Text>
            <Text style={styles.sectionSubtitle}>
              Auto-refreshes every 60 seconds. Sorted by suggest_score
              (score / (1 + idle_drivers)).
            </Text>

            {sortedZones.length === 0 ? (
              <Text style={styles.emptyText}>
                No zone heat data available. The heat engine may not have run
                yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Header row */}
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.cell, styles.cellName, styles.headerText]}>
                      Zone
                    </Text>
                    <Text style={[styles.cell, styles.cellTag, styles.headerText]}>
                      Tag
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Score
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Baseline
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Live
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      EWMA
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Idle
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Suggest
                    </Text>
                  </View>
                  {sortedZones.map((z) => {
                    const chip = TAG_CHIP[z.tag] ?? TAG_CHIP.neutral;
                    return (
                      <View key={z.zone_id} style={styles.tableRow}>
                        <Text
                          style={[styles.cell, styles.cellName, styles.cellValue]}
                          numberOfLines={1}
                        >
                          {z.zone_name ?? z.zone_id.slice(0, 8)}
                        </Text>
                        <View style={[styles.cell, styles.cellTag]}>
                          <View
                            style={[
                              styles.tagChip,
                              { backgroundColor: chip.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.tagText,
                                { color: chip.text },
                              ]}
                            >
                              {chip.label}
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.cell, styles.cellNum]}>
                          {renderScoreBar(z.score)}
                          <Text style={styles.cellValue}>
                            {(z.score * 100).toFixed(1)}
                          </Text>
                        </View>
                        <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                          {z.baseline_pct}
                        </Text>
                        <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                          {z.live_pctile}
                        </Text>
                        <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                          {z.live_ewma?.toFixed(3) ?? "—"}
                        </Text>
                        <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                          {z.idle_driver_count}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            styles.cellNum,
                            styles.cellValue,
                            { color: colors.adminAccent },
                          ]}
                        >
                          {(z.suggest_score * 100).toFixed(1)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  bannerCard: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 20,
  },
  bannerLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  bannerValue: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    marginBottom: 4,
  },
  bannerHint: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 20,
  },
  sectionTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
    marginBottom: 4,
  },
  sectionSubtitle: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginBottom: 16,
  },
  emptyText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    paddingVertical: 12,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
    paddingVertical: 10,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "rgba(100, 181, 246, 0.06)",
  },
  cell: {
    paddingHorizontal: 8,
  },
  cellName: { width: 160 },
  cellTag: { width: 90 },
  cellNum: { width: 80, alignItems: "center" },
  headerText: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  cellValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    textAlign: "center",
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "center",
  },
  tagText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  barTrack: {
    width: 48,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#2A2D35",
    overflow: "hidden",
    marginBottom: 2,
  },
  barFill: {
    height: "100%",
    borderRadius: 3,
  },
  ghostBtn: {
    backgroundColor: colors.darkSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  ghostBtnDisabled: { opacity: 0.5 },
  ghostBtnText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
});
