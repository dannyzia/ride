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

type GateStatus = "green" | "red" | "calibration_needed";

interface GateMetric {
  key: string;
  label: string;
  measured: number | null;
  threshold: number;
  status: GateStatus;
  hint: string;
}

interface DeviationByVehicle {
  vehicle_type: string;
  median_abs_pct: number | null;
  ride_count: number;
}

interface DeviationDistribution {
  "0-5%": number;
  "5-10%": number;
  "10-15%": number;
  "15-25%": number;
  "25%+": number;
  negative: number;
}

interface RecentDeviation {
  ride_id: string;
  completed_at: string;
  vehicle_type: string;
  v2_total_bdt: number;
  v6_total_bdt: number;
  abs_diff_bdt: number | null;
  abs_pct: number | null;
}

interface DeviationDetail {
  shadow_coverage_pct: number | null;
  shadow_ride_count: number;
  total_completed_rides: number;
  deviation_30d: number | null;
  deviation_7d: number | null;
  deviation_7d_ride_count: number;
  trend: "improving" | "worsening" | "stable" | "insufficient_data";
  by_vehicle_type: DeviationByVehicle[];
  distribution: DeviationDistribution;
  recent_deviations: RecentDeviation[];
}

interface GateMetricsResponse {
  metrics?: GateMetric[];
  deviation_detail?: DeviationDetail;
  lookback_days?: number;
  evaluated_at?: string;
}

const STATUS_CHIP: Record<
  GateStatus,
  { label: string; bg: string; text: string; icon: string }
> = {
  green: {
    label: "PASS",
    bg: "rgba(34, 197, 94, 0.12)",
    text: "#22c55e",
    icon: "✓",
  },
  red: {
    label: "FAIL",
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#ef4444",
    icon: "✗",
  },
  calibration_needed: {
    label: "CALIBRATION NEEDED",
    bg: "rgba(245, 158, 11, 0.12)",
    text: "#f59e0b",
    icon: "⚠",
  },
};

const TREND_CHIP: Record<
  string,
  { label: string; bg: string; text: string; icon: string }
> = {
  improving: {
    label: "IMPROVING",
    bg: "rgba(34, 197, 94, 0.12)",
    text: "#22c55e",
    icon: "↓",
  },
  worsening: {
    label: "WORSENING",
    bg: "rgba(239, 68, 68, 0.12)",
    text: "#ef4444",
    icon: "↑",
  },
  stable: {
    label: "STABLE",
    bg: "rgba(100, 181, 246, 0.12)",
    text: "#64b5f6",
    icon: "→",
  },
  insufficient_data: {
    label: "INSUFFICIENT DATA",
    bg: "rgba(148, 163, 184, 0.12)",
    text: "#94a3b8",
    icon: "?",
  },
};

const AUTO_REFRESH_MS = 60_000;

/** Short vehicle type label for display. */
const VT_LABEL: Record<string, string> = {
  bike_basic: "Bike Basic",
  bike_standard: "Bike Std",
  bike_plus: "Bike Plus",
  cng: "CNG",
  car_compact: "Compact",
  car_economy: "Economy",
  car_comfort: "Comfort",
  car_premium: "Premium",
  car_xl: "XL",
};

function formatMeasured(key: string, value: number | null): string {
  if (value === null) return "—";
  switch (key) {
    case "complaint_rate":
      return value.toFixed(2);
    case "quote_deviation":
      return `${value.toFixed(1)}%`;
    case "periphery_accept":
      return `${value.toFixed(1)}%`;
    case "backstop_binding":
      return `${value.toFixed(1)}%`;
    case "driver_retention":
      return `${value.toFixed(1)}pp`;
    case "heat_correlation":
      return value.toFixed(3);
    default:
      return value.toFixed(2);
  }
}

function formatThreshold(key: string, value: number): string {
  if (value === 0) return "Not set";
  switch (key) {
    case "complaint_rate":
      return `≤${value}/1k`;
    case "quote_deviation":
      return `≤${value}%`;
    case "periphery_accept":
      return `≥${value}%`;
    case "backstop_binding":
      return `≤${value}%`;
    case "driver_retention":
      return `≤${value}pp`;
    case "heat_correlation":
      return `≥${value}`;
    default:
      return String(value);
  }
}

/** Paisa to ৳ display (integer paisa → decimal taka). */
function paisaToTaka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}

/** Truncate UUID to 8 chars for display. */
function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export default function FareGateMetricsScreen() {
  const toast = useAdminToast();
  const [metrics, setMetrics] = useState<GateMetric[]>([]);
  const [devDetail, setDevDetail] = useState<DeviationDetail | null>(null);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const { data, error, status } = await adminFetch<GateMetricsResponse>(
        "/api/admin/fare-gate-metrics",
        { method: "GET" },
      );
      if (error || !data) {
        if (status !== 0) {
          toast.show(
            `Failed to load gate metrics: ${error ?? "unknown"}`,
            "error",
          );
        }
      } else {
        setMetrics(data.metrics ?? []);
        setDevDetail(data.deviation_detail ?? null);
        setLookbackDays(data.lookback_days ?? 30);
        setEvaluatedAt(data.evaluated_at ?? null);
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

  const overallStatus: GateStatus = (() => {
    if (metrics.length === 0) return "calibration_needed";
    if (metrics.some((m) => m.status === "red")) return "red";
    if (metrics.every((m) => m.status === "green")) return "green";
    return "calibration_needed";
  })();

  const overallChip = STATUS_CHIP[overallStatus];
  const passCount = metrics.filter((m) => m.status === "green").length;
  const failCount = metrics.filter((m) => m.status === "red").length;
  const calibCount = metrics.filter(
    (m) => m.status === "calibration_needed",
  ).length;

  return (
    <AdminShell
      title="Fare Gate Metrics"
      subtitle={`v6-vs-v2 deviation dashboard — ${lookbackDays}-day evaluation window`}
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
          {/* Overall status banner */}
          <View style={styles.bannerCard}>
            <View style={styles.bannerHeader}>
              <Text style={styles.bannerLabel}>Overall Gate Status</Text>
              <View
                style={[
                  styles.statusChipLarge,
                  { backgroundColor: overallChip.bg },
                ]}
              >
                <Text style={[styles.statusTextLarge, { color: overallChip.text }]}>
                  {overallChip.icon} {overallChip.label}
                </Text>
              </View>
            </View>
            <View style={styles.bannerSummary}>
              <Text style={[styles.summaryItem, { color: "#22c55e" }]}>
                {passCount} pass
              </Text>
              <Text style={[styles.summaryItem, { color: "#ef4444" }]}>
                {failCount} fail
              </Text>
              <Text style={[styles.summaryItem, { color: "#f59e0b" }]}>
                {calibCount} needs calibration
              </Text>
            </View>
            {evaluatedAt && (
              <Text style={styles.bannerHint}>
                Evaluated: {new Date(evaluatedAt).toLocaleString()} — window:{" "}
                {lookbackDays} days
              </Text>
            )}
          </View>

          {/* Gate metrics table */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Gate Metrics</Text>
            <Text style={styles.sectionSubtitle}>
              Threshold = 0 means the gate is not yet calibrated. Set the value
              in Platform Config to activate.
            </Text>

            {metrics.length === 0 ? (
              <Text style={styles.emptyText}>
                No gate metrics available. The fare framework may not have
                produced shadow data yet.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Header row */}
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text
                      style={[styles.cell, styles.cellStatus, styles.headerText]}
                    >
                      Status
                    </Text>
                    <Text
                      style={[styles.cell, styles.cellLabel, styles.headerText]}
                    >
                      Gate
                    </Text>
                    <Text
                      style={[styles.cell, styles.cellMeasured, styles.headerText]}
                    >
                      Measured
                    </Text>
                    <Text
                      style={[styles.cell, styles.cellThreshold, styles.headerText]}
                    >
                      Threshold
                    </Text>
                    <Text
                      style={[styles.cell, styles.cellHint, styles.headerText]}
                    >
                      Trigger / Hint
                    </Text>
                  </View>

                  {metrics.map((m) => {
                    const chip = STATUS_CHIP[m.status];
                    return (
                      <View key={m.key} style={styles.tableRow}>
                        <View style={[styles.cell, styles.cellStatus]}>
                          <View
                            style={[
                              styles.statusChip,
                              { backgroundColor: chip.bg },
                            ]}
                          >
                            <Text
                              style={[styles.statusText, { color: chip.text }]}
                            >
                              {chip.icon} {chip.label}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={[
                            styles.cell,
                            styles.cellLabel,
                            styles.cellValue,
                          ]}
                          numberOfLines={2}
                        >
                          {m.label}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            styles.cellMeasured,
                            {
                              color:
                                m.status === "green"
                                  ? "#22c55e"
                                  : m.status === "red"
                                    ? "#ef4444"
                                    : colors.textPrimaryDark,
                              fontFamily: "Jakarta-Bold",
                            },
                          ]}
                        >
                          {formatMeasured(m.key, m.measured)}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            styles.cellThreshold,
                            styles.cellValue,
                          ]}
                        >
                          {formatThreshold(m.key, m.threshold)}
                        </Text>
                        <Text
                          style={[
                            styles.cell,
                            styles.cellHint,
                            styles.cellValue,
                          ]}
                          numberOfLines={3}
                        >
                          {m.hint}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>

          {/* ── Deviation Detail Panel ── */}
          {devDetail && <DeviationDetailPanel detail={devDetail} />}

          {/* Explanation card */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>About These Gates</Text>
            <Text style={styles.bodyText}>
              These metrics track the Stage 0 → Stage 1 transition gates from
              §6 of the fare framework spec. During Stage 0, the v6 fare engine
              runs in shadow mode (computed but not billed). The gate dashboard
              measures v6-vs-v2 deviation and other quality indicators to
              determine when it is safe to flip fare_framework_stage to stage1.
            </Text>
            <View style={{ gap: 6, marginTop: 12 }}>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Complaint Rate</Text>{" "}
                — cancel surveys completed per 1,000 charged rides. Target:
                &lt;5/1k.
              </Text>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Quote Deviation</Text>{" "}
                — median absolute % difference between v6 shadow total and v2
                billed rider_payable. Target: ≤15%.
              </Text>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Periphery Accept</Text>{" "}
                — accept rate for rides in cold-tagged zones. Tracks dispatch
                quality in low-demand areas.
              </Text>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Backstop Binding</Text>{" "}
                — % of charged pickup fees where the %-of-fare backstop
                activated. Target: &lt;40% (PATCH 5 default: 0 = CALIBRATION
                NEEDED).
              </Text>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Driver Retention</Text>{" "}
                — week-over-week drop in active drivers (completed ≥1 ride).
                Target: &lt;5pp drop.
              </Text>
              <Text style={styles.bodyBullet}>
                • <Text style={{ fontFamily: "Jakarta-Bold" }}>Heat Correlation</Text>{" "}
                — backtest correlation of heat model predictions. Target: ≥0.3.
              </Text>
            </View>
          </View>
        </View>
      )}
    </AdminShell>
  );
}

/* ── Deviation Detail Panel (sub-component) ────────────────────────── */

function DeviationDetailPanel({ detail }: { detail: DeviationDetail }) {
  const trendChip = TREND_CHIP[detail.trend] ?? TREND_CHIP.insufficient_data;

  // Max bucket count for distribution bar scale
  const distValues = [
    detail.distribution["0-5%"],
    detail.distribution["5-10%"],
    detail.distribution["10-15%"],
    detail.distribution["15-25%"],
    detail.distribution["25%+"],
    detail.distribution.negative,
  ];
  const maxBucket = Math.max(...distValues, 1);

  const buckets: { label: string; count: number; color: string }[] = [
    { label: "0–5%", count: detail.distribution["0-5%"], color: "#22c55e" },
    { label: "5–10%", count: detail.distribution["5-10%"], color: "#84cc16" },
    { label: "10–15%", count: detail.distribution["10-15%"], color: "#f59e0b" },
    { label: "15–25%", count: detail.distribution["15-25%"], color: "#f97316" },
    { label: "25%+", count: detail.distribution["25%+"], color: "#ef4444" },
    { label: "negative", count: detail.distribution.negative, color: "#64b5f6" },
  ];

  return (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>Shadow Deviation Analysis</Text>
      <Text style={styles.sectionSubtitle}>
        Real-time v6-vs-v2 comparison — how closely does the shadow engine match
        the billing engine?
      </Text>

      {/* Summary row: coverage + trend + 7d/30d */}
      <View style={styles.devSummaryRow}>
        {/* Coverage badge */}
        <View style={styles.devSummaryBlock}>
          <Text style={styles.devSummaryLabel}>Shadow Coverage</Text>
          <Text style={styles.devSummaryValue}>
            {detail.shadow_coverage_pct !== null
              ? `${detail.shadow_coverage_pct}%`
              : "—"}
          </Text>
          <Text style={styles.devSummarySub}>
            {detail.shadow_ride_count.toLocaleString()} /{" "}
            {detail.total_completed_rides.toLocaleString()} rides
          </Text>
        </View>

        {/* 30-day median */}
        <View style={styles.devSummaryBlock}>
          <Text style={styles.devSummaryLabel}>30d Median Deviation</Text>
          <Text
            style={[
              styles.devSummaryValue,
              {
                color:
                  detail.deviation_30d === null
                    ? colors.textDisabledDark
                    : detail.deviation_30d > 15
                      ? "#ef4444"
                      : detail.deviation_30d > 10
                        ? "#f59e0b"
                        : "#22c55e",
              },
            ]}
          >
            {detail.deviation_30d !== null
              ? `${detail.deviation_30d.toFixed(1)}%`
              : "—"}
          </Text>
          <Text style={styles.devSummarySub}>across all vehicles</Text>
        </View>

        {/* 7-day median */}
        <View style={styles.devSummaryBlock}>
          <Text style={styles.devSummaryLabel}>7d Median Deviation</Text>
          <Text
            style={[
              styles.devSummaryValue,
              {
                color:
                  detail.deviation_7d === null
                    ? colors.textDisabledDark
                    : detail.deviation_7d > 15
                      ? "#ef4444"
                      : detail.deviation_7d > 10
                        ? "#f59e0b"
                        : "#22c55e",
              },
            ]}
          >
            {detail.deviation_7d !== null
              ? `${detail.deviation_7d.toFixed(1)}%`
              : "—"}
          </Text>
          <Text style={styles.devSummarySub}>
            {detail.deviation_7d_ride_count} rides
          </Text>
        </View>

        {/* Trend */}
        <View style={styles.devSummaryBlock}>
          <Text style={styles.devSummaryLabel}>Trend</Text>
          <View
            style={[
              styles.statusChip,
              { backgroundColor: trendChip.bg, marginTop: 4 },
            ]}
          >
            <Text style={[styles.statusText, { color: trendChip.text }]}>
              {trendChip.icon} {trendChip.label}
            </Text>
          </View>
          <Text style={styles.devSummarySub}>7d vs 30d</Text>
        </View>
      </View>

      {/* Per-vehicle-type breakdown */}
      {detail.by_vehicle_type.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={styles.devSubsectionTitle}>Deviation by Vehicle Type</Text>
          <View style={styles.devVehicleHeader}>
            <Text style={[styles.devVehicleCell, styles.devVehicleCellType, styles.headerText]}>
              Vehicle Type
            </Text>
            <Text style={[styles.devVehicleCell, styles.devVehicleCellMedian, styles.headerText]}>
              Median Abs %
            </Text>
            <Text style={[styles.devVehicleCell, styles.devVehicleCellCount, styles.headerText]}>
              Rides
            </Text>
          </View>
          {detail.by_vehicle_type.map((vt) => (
            <View key={vt.vehicle_type} style={styles.devVehicleRow}>
              <Text style={[styles.devVehicleCell, styles.devVehicleCellType]}>
                {VT_LABEL[vt.vehicle_type] ?? vt.vehicle_type}
              </Text>
              <Text
                style={[
                  styles.devVehicleCell,
                  styles.devVehicleCellMedian,
                  {
                    color:
                      vt.median_abs_pct === null
                        ? colors.textDisabledDark
                        : vt.median_abs_pct > 15
                          ? "#ef4444"
                          : vt.median_abs_pct > 10
                            ? "#f59e0b"
                            : "#22c55e",
                    fontFamily: "Jakarta-Bold",
                  },
                ]}
              >
                {vt.median_abs_pct !== null ? `${vt.median_abs_pct.toFixed(1)}%` : "—"}
              </Text>
              <Text style={[styles.devVehicleCell, styles.devVehicleCellCount]}>
                {vt.ride_count}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Distribution histogram */}
      <View style={{ marginTop: 20 }}>
        <Text style={styles.devSubsectionTitle}>Deviation Distribution</Text>
        <View style={{ gap: 6 }}>
          {buckets.map((b) => (
            <View key={b.label} style={styles.devBarRow}>
              <Text style={styles.devBarLabel}>{b.label}</Text>
              <View style={styles.devBarTrack}>
                <View
                  style={[
                    styles.devBarFill,
                    {
                      backgroundColor: b.color,
                      width: `${Math.max((b.count / maxBucket) * 100, b.count > 0 ? 3 : 0)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.devBarCount}>{b.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Recent rides table */}
      {detail.recent_deviations.length > 0 && (
        <View style={{ marginTop: 20 }}>
          <Text style={styles.devSubsectionTitle}>
            Recent Rides (last 20 with shadow data)
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={[styles.devRideHeader]}>
                <Text style={[styles.devRideCell, styles.devRideIdCell, styles.headerText]}>
                  Ride
                </Text>
                <Text style={[styles.devRideCell, styles.devRideDateCell, styles.headerText]}>
                  Completed
                </Text>
                <Text style={[styles.devRideCell, styles.devRideTypeCell, styles.headerText]}>
                  Type
                </Text>
                <Text style={[styles.devRideCell, styles.devRideAmtCell, styles.headerText]}>
                  V2 Bill
                </Text>
                <Text style={[styles.devRideCell, styles.devRideAmtCell, styles.headerText]}>
                  V6 Shadow
                </Text>
                <Text style={[styles.devRideCell, styles.devRideAmtCell, styles.headerText]}>
                  Diff
                </Text>
                <Text style={[styles.devRideCell, styles.devRidePctCell, styles.headerText]}>
                  Abs %
                </Text>
              </View>
              {detail.recent_deviations.map((r) => (
                <View key={r.ride_id} style={styles.devRideRow}>
                  <Text style={[styles.devRideCell, styles.devRideIdCell]}>
                    {shortId(r.ride_id)}
                  </Text>
                  <Text style={[styles.devRideCell, styles.devRideDateCell]}>
                    {new Date(r.completed_at).toLocaleDateString()}
                  </Text>
                  <Text style={[styles.devRideCell, styles.devRideTypeCell]}>
                    {VT_LABEL[r.vehicle_type] ?? r.vehicle_type}
                  </Text>
                  <Text style={[styles.devRideCell, styles.devRideAmtCell]}>
                    {paisaToTaka(r.v2_total_bdt)}
                  </Text>
                  <Text style={[styles.devRideCell, styles.devRideAmtCell]}>
                    {paisaToTaka(r.v6_total_bdt)}
                  </Text>
                  <Text
                    style={[
                      styles.devRideCell,
                      styles.devRideAmtCell,
                      {
                        color:
                          r.abs_diff_bdt === null
                            ? colors.textDisabledDark
                            : r.abs_diff_bdt > 0
                              ? "#ef4444"
                              : "#22c55e",
                      },
                    ]}
                  >
                    {r.abs_diff_bdt !== null ? paisaToTaka(r.abs_diff_bdt) : "—"}
                  </Text>
                  <Text
                    style={[
                      styles.devRideCell,
                      styles.devRidePctCell,
                      {
                        color:
                          r.abs_pct === null
                            ? colors.textDisabledDark
                            : r.abs_pct > 15
                              ? "#ef4444"
                              : r.abs_pct > 10
                                ? "#f59e0b"
                                : "#22c55e",
                        fontFamily: "Jakarta-Bold",
                      },
                    ]}
                  >
                    {r.abs_pct !== null ? `${r.abs_pct}%` : "—"}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
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
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  bannerLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusChipLarge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusTextLarge: {
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    letterSpacing: 0.3,
  },
  bannerSummary: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 8,
  },
  summaryItem: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
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
  bodyText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  bodyBullet: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    lineHeight: 20,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
    paddingVertical: 12,
    alignItems: "center",
  },
  tableHeader: {
    backgroundColor: "rgba(100, 181, 246, 0.06)",
  },
  cell: {
    paddingHorizontal: 8,
  },
  cellStatus: { width: 160 },
  cellLabel: { width: 200 },
  cellMeasured: { width: 90, alignItems: "center" },
  cellValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    textAlign: "center",
  },
  cellThreshold: { width: 100, alignItems: "center" },
  cellHint: { width: 280 },
  headerText: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "center",
  },
  statusText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 9,
    letterSpacing: 0.4,
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

  /* ── Deviation Detail styles ── */
  devSummaryRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
  },
  devSummaryBlock: {
    flex: 1,
    minWidth: 140,
    backgroundColor: "rgba(100, 181, 246, 0.04)",
    borderRadius: 8,
    padding: 12,
  },
  devSummaryLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  devSummaryValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
  },
  devSummarySub: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  devSubsectionTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    marginBottom: 10,
  },
  /* Vehicle type table */
  devVehicleHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
    paddingBottom: 6,
    marginBottom: 2,
  },
  devVehicleRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1A1D25",
    paddingVertical: 8,
    alignItems: "center",
  },
  devVehicleCell: {
    paddingHorizontal: 8,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  devVehicleCellType: { width: 120 },
  devVehicleCellMedian: { width: 100, textAlign: "center" },
  devVehicleCellCount: { width: 60, textAlign: "center" },
  /* Distribution bars */
  devBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  devBarLabel: {
    width: 70,
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    textAlign: "right",
  },
  devBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: "rgba(42, 45, 53, 0.6)",
    borderRadius: 3,
    overflow: "hidden",
  },
  devBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  devBarCount: {
    width: 40,
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textAlign: "right",
  },
  /* Recent rides table */
  devRideHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
    paddingBottom: 6,
    marginBottom: 2,
  },
  devRideRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1A1D25",
    paddingVertical: 6,
    alignItems: "center",
  },
  devRideCell: {
    paddingHorizontal: 6,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  devRideIdCell: { width: 80 },
  devRideDateCell: { width: 90 },
  devRideTypeCell: { width: 80 },
  devRideAmtCell: { width: 80, textAlign: "right" },
  devRidePctCell: { width: 60, textAlign: "right" },
});
