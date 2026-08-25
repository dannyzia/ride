import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface PercentileRow {
  category: string;
  zone_id: string;
  zone_name: string;
  p50: number;
  p70: number;
  p75: number;
  p90: number;
  charge_incidence_pct: number;
  quote_deviation_low: number;
  quote_deviation_high: number;
  sample_count: number;
  cap_binding_pct: number;
  backstop_binding_pct: number;
}

interface AnalyticsResponse {
  distributions?: PercentileRow[];
  summary?: {
    total_samples: number;
    categories: string[];
    zones: string[];
  };
}

export default function PickupAnalyticsScreen() {
  const toast = useAdminToast();
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [daysBack, setDaysBack] = useState("30");

  const fetchData = useCallback(async () => {
    setLoading(true);
    const n = Number(daysBack);
    const query = Number.isFinite(n) && n > 0 ? `?days=${Math.round(n)}` : "";
    const { data: res, error, status } = await adminFetch<AnalyticsResponse>(
      `/api/admin/pickup-analytics${query}`,
      { method: "GET" },
    );
    if (error || !res) {
      if (status !== 0) {
        toast.show(
          `Failed to load analytics: ${error ?? "unknown"}`,
          "error",
        );
      }
    } else {
      setData(res);
    }
    setLoading(false);
  }, [toast, daysBack]);

  useEffect(() => {
    fetchData();
  }, []);

  const rows = data?.distributions ?? [];
  const summary = data?.summary;

  const sortedRows = [...rows].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return (a.zone_name ?? "").localeCompare(b.zone_name ?? "");
  });

  return (
    <AdminShell
      title="Pickup Analytics"
      subtitle="Stage 0 calibration dashboard — percentile distributions per category × zone"
      actions={
        <View style={styles.actionsRow}>
          <View style={styles.daysInput}>
            <Text style={styles.daysLabel}>Days:</Text>
            <TextInput
              style={styles.daysField}
              value={daysBack}
              onChangeText={setDaysBack}
              keyboardType="numeric"
              placeholderTextColor={colors.textDisabledDark}
            />
          </View>
          <Pressable
            style={[styles.ghostBtn, loading && styles.ghostBtnDisabled]}
            onPress={fetchData}
            disabled={loading}
          >
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
        </View>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* Summary banner */}
          {summary && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {summary.total_samples}
                </Text>
                <Text style={styles.summaryLabel}>Total Samples</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {summary.categories?.length ?? 0}
                </Text>
                <Text style={styles.summaryLabel}>Categories</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>
                  {summary.zones?.length ?? 0}
                </Text>
                <Text style={styles.summaryLabel}>Zones</Text>
              </View>
            </View>
          )}

          {/* Distribution table */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Percentile Distributions (km)
            </Text>
            <Text style={styles.sectionSubtitle}>
              p70/p75 suggestions for free-radius calibration. Target: 25–30%
              charge incidence.
            </Text>

            {sortedRows.length === 0 ? (
              <Text style={styles.emptyText}>
                No pickup distance samples found. Ensure
                pickup_measurement_enabled is true and rides have been completed.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  {/* Header */}
                  <View style={[styles.tableRow, styles.tableHeader]}>
                    <Text style={[styles.cell, styles.cellCat, styles.headerText]}>
                      Category
                    </Text>
                    <Text style={[styles.cell, styles.cellZone, styles.headerText]}>
                      Zone
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      p50
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      p70
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      p75
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      p90
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Charge %
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Dev Low
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Dev High
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      N
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Cap %
                    </Text>
                    <Text style={[styles.cell, styles.cellNum, styles.headerText]}>
                      Backstop %
                    </Text>
                  </View>
                  {sortedRows.map((r, i) => (
                    <View
                      key={`${r.category}-${r.zone_id}-${i}`}
                      style={styles.tableRow}
                    >
                      <Text
                        style={[styles.cell, styles.cellCat, styles.cellValue]}
                      >
                        {r.category}
                      </Text>
                      <Text
                        style={[styles.cell, styles.cellZone, styles.cellValue]}
                        numberOfLines={1}
                      >
                        {r.zone_name ?? r.zone_id?.slice(0, 8) ?? "—"}
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.p50?.toFixed(2) ?? "—"}
                      </Text>
                      <Text
                        style={[
                          styles.cell,
                          styles.cellNum,
                          styles.cellValue,
                          { color: colors.adminAccent },
                        ]}
                      >
                        {r.p70?.toFixed(2) ?? "—"}
                      </Text>
                      <Text
                        style={[
                          styles.cell,
                          styles.cellNum,
                          styles.cellValue,
                          { color: colors.adminAccent },
                        ]}
                      >
                        {r.p75?.toFixed(2) ?? "—"}
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.p90?.toFixed(2) ?? "—"}
                      </Text>
                      <Text
                        style={[
                          styles.cell,
                          styles.cellNum,
                          styles.cellValue,
                          {
                            color:
                              r.charge_incidence_pct >= 25 &&
                              r.charge_incidence_pct <= 30
                                ? colors.success
                                : r.charge_incidence_pct > 30
                                  ? colors.amber
                                  : colors.textPrimaryDark,
                          },
                        ]}
                      >
                        {r.charge_incidence_pct?.toFixed(1) ?? "—"}%
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.quote_deviation_low?.toFixed(1) ?? "—"}%
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.quote_deviation_high?.toFixed(1) ?? "—"}%
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.sample_count ?? 0}
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.cap_binding_pct?.toFixed(1) ?? "—"}%
                      </Text>
                      <Text style={[styles.cell, styles.cellNum, styles.cellValue]}>
                        {r.backstop_binding_pct?.toFixed(1) ?? "—"}%
                      </Text>
                    </View>
                  ))}
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
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  daysInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  daysLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  daysField: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    width: 60,
    textAlign: "center",
  },
  summaryCard: {
    flexDirection: "row",
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 20,
    gap: 24,
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryValue: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 22,
  },
  summaryLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
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
  cellCat: { width: 80 },
  cellZone: { width: 120 },
  cellNum: { width: 72, alignItems: "center" },
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
