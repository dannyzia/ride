import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface FraudFlag {
  id: string;
  driver_id: string;
  driver_name: string;
  flag_type: string;
  offense_count: number;
  status: string;
  evidence: Record<string, unknown> | null;
  created_at: string;
  resolved_at: string | null;
}

interface RecalibrationRow {
  id: string;
  zone_id: string;
  zone_name: string;
  deviation_pct: number;
  sample_count: number;
  status: string;
  created_at: string;
}

interface TrustSafetyResponse {
  fraud_flags?: FraudFlag[];
  recalibration_queue?: RecalibrationRow[];
}

const FLAG_TYPE_CHIP: Record<
  string,
  { label: string; bg: string; text: string }
> = {
  dawdle: {
    label: "DAWDLE",
    bg: "rgba(245, 158, 11, 0.15)",
    text: colors.amber,
  },
  off_platform_completion: {
    label: "OFF-PLATFORM",
    bg: "rgba(227, 29, 28, 0.15)",
    text: colors.danger,
  },
  cancel_rate: {
    label: "CANCEL RATE",
    bg: "rgba(99, 102, 241, 0.15)",
    text: colors.indigo,
  },
  heat_manipulation: {
    label: "HEAT",
    bg: "rgba(14, 165, 233, 0.15)",
    text: colors.accent,
  },
};

const STATUS_CHIP: Record<
  string,
  { bg: string; text: string }
> = {
  open: { bg: "rgba(245, 158, 11, 0.15)", text: colors.amber },
  warned: { bg: "rgba(99, 102, 241, 0.15)", text: colors.indigo },
  escalated: { bg: "rgba(227, 29, 28, 0.15)", text: colors.danger },
  blocked: { bg: "rgba(227, 29, 28, 0.25)", text: colors.danger },
  resolved: { bg: "rgba(56, 161, 105, 0.15)", text: colors.success },
};

const FILTER_TYPES = ["all", "dawdle", "off_platform_completion", "cancel_rate", "heat_manipulation"];
const FILTER_STATUSES = ["all", "open", "warned", "escalated", "blocked", "resolved"];

const SLA_DAYS = 5;

function daysUntilSla(createdAt: string): number {
  const created = new Date(createdAt).getTime();
  const deadline = created + SLA_DAYS * 24 * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  return Math.ceil(remaining / (24 * 60 * 60 * 1000));
}

export default function TrustSafetyScreen() {
  const toast = useAdminToast();
  const [flags, setFlags] = useState<FraudFlag[]>([]);
  const [recalQueue, setRecalQueue] = useState<RecalibrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [confirmResolve, setConfirmResolve] = useState<FraudFlag | null>(null);
  const [resolving, setResolving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<TrustSafetyResponse>(
      "/api/admin/fraud-flags",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(
          `Failed to load data: ${error ?? "unknown"}`,
          "error",
        );
      }
    } else {
      setFlags(data.fraud_flags ?? []);
      setRecalQueue(data.recalibration_queue ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResolve = async () => {
    if (!confirmResolve) return;
    setResolving(true);
    const { error, status } = await adminFetch(
      `/api/admin/fraud-flags/${confirmResolve.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "resolved" }),
      },
    );
    if (error) {
      if (status !== 0) {
        toast.show(`Resolve failed: ${error}`, "error");
      }
    } else {
      toast.show("Flag resolved", "success");
      setFlags((prev) =>
        prev.map((f) =>
          f.id === confirmResolve.id
            ? { ...f, status: "resolved", resolved_at: new Date().toISOString() }
            : f,
        ),
      );
    }
    setConfirmResolve(null);
    setResolving(false);
  };

  const filteredFlags = flags.filter((f) => {
    if (typeFilter !== "all" && f.flag_type !== typeFilter) return false;
    if (statusFilter !== "all" && f.status !== statusFilter) return false;
    return true;
  });

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-GB", {
        timeZone: "Asia/Dhaka",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  };

  return (
    <AdminShell
      title="Trust & Safety"
      subtitle="Fraud flags, dawdle/off-platform ladders, and zone recalibration queue"
      actions={
        <Pressable
          style={[styles.ghostBtn, loading && styles.ghostBtnDisabled]}
          onPress={fetchData}
          disabled={loading}
        >
          <Text style={styles.ghostBtnText}>Refresh</Text>
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* Fraud flags section */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Fraud Flags</Text>
            <Text style={styles.sectionSubtitle}>
              Dawdle, off-platform completion, cancel rate, and heat manipulation
              flags.
            </Text>

            {/* Filters */}
            <View style={styles.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {FILTER_TYPES.map((t) => (
                    <Pressable
                      key={t}
                      style={[
                        styles.filterChip,
                        typeFilter === t && styles.filterChipActive,
                      ]}
                      onPress={() => setTypeFilter(t)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          typeFilter === t && styles.filterChipTextActive,
                        ]}
                      >
                        {t === "all"
                          ? "All Types"
                          : (FLAG_TYPE_CHIP[t]?.label ?? t)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.filterRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {FILTER_STATUSES.map((s) => (
                    <Pressable
                      key={s}
                      style={[
                        styles.filterChip,
                        statusFilter === s && styles.filterChipActive,
                      ]}
                      onPress={() => setStatusFilter(s)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          statusFilter === s && styles.filterChipTextActive,
                        ]}
                      >
                        {s === "all" ? "All Statuses" : s}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
            </View>

            {filteredFlags.length === 0 ? (
              <Text style={styles.emptyText}>
                No fraud flags match the current filters.
              </Text>
            ) : (
              <View style={styles.flagList}>
                {filteredFlags.map((f) => {
                  const typeChip = FLAG_TYPE_CHIP[f.flag_type] ?? {
                    label: f.flag_type.toUpperCase(),
                    bg: "rgba(156, 163, 175, 0.12)",
                    text: colors.textSecondaryDark,
                  };
                  const statusChip = STATUS_CHIP[f.status] ?? STATUS_CHIP.open;
                  return (
                    <View key={f.id} style={styles.flagRow}>
                      <View style={styles.flagMain}>
                        <Text style={styles.driverName}>
                          {f.driver_name ?? f.driver_id.slice(0, 8)}
                        </Text>
                        <View style={styles.flagChips}>
                          <View
                            style={[
                              styles.chip,
                              { backgroundColor: typeChip.bg },
                            ]}
                          >
                            <Text
                              style={[styles.chipText, { color: typeChip.text }]}
                            >
                              {typeChip.label}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.chip,
                              { backgroundColor: statusChip.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.chipText,
                                { color: statusChip.text },
                              ]}
                            >
                              {f.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.flagMeta}>
                          Offense #{f.offense_count} · {formatDate(f.created_at)}
                        </Text>
                      </View>
                      {(f.status === "open" ||
                        f.status === "warned" ||
                        f.status === "escalated") && (
                        <View style={styles.flagActions}>
                          <Pressable
                            style={styles.resolveBtn}
                            onPress={() => setConfirmResolve(f)}
                          >
                            <Text style={styles.resolveBtnText}>Resolve</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Zone recalibration queue */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>
              Zone Recalibration Queue
            </Text>
            <Text style={styles.sectionSubtitle}>
              Zones with quoted-vs-actual deviation exceeding threshold. SLA:{" "}
              {SLA_DAYS} days.
            </Text>

            {recalQueue.length === 0 ? (
              <Text style={styles.emptyText}>
                No zones pending recalibration.
              </Text>
            ) : (
              <View>
                <View style={[styles.recalRow, styles.recalHeader]}>
                  <Text style={[styles.recalCell, styles.recalZone, styles.headerText]}>
                    Zone
                  </Text>
                  <Text style={[styles.recalCell, styles.recalNum, styles.headerText]}>
                    Deviation
                  </Text>
                  <Text style={[styles.recalCell, styles.recalNum, styles.headerText]}>
                    Samples
                  </Text>
                  <Text style={[styles.recalCell, styles.recalNum, styles.headerText]}>
                    Status
                  </Text>
                  <Text style={[styles.recalCell, styles.recalNum, styles.headerText]}>
                    SLA Remaining
                  </Text>
                  <Text style={[styles.recalCell, styles.recalDate, styles.headerText]}>
                    Created
                  </Text>
                </View>
                {recalQueue.map((r) => {
                  const slaDays = daysUntilSla(r.created_at);
                  const slaOverdue = slaDays < 0;
                  return (
                    <View key={r.id} style={styles.recalRow}>
                      <Text
                        style={[
                          styles.recalCell,
                          styles.recalZone,
                          styles.cellValue,
                        ]}
                        numberOfLines={1}
                      >
                        {r.zone_name ?? r.zone_id.slice(0, 8)}
                      </Text>
                      <Text
                        style={[
                          styles.recalCell,
                          styles.recalNum,
                          styles.cellValue,
                          {
                            color:
                              r.deviation_pct > 30
                                ? colors.danger
                                : colors.amber,
                          },
                        ]}
                      >
                        {r.deviation_pct.toFixed(1)}%
                      </Text>
                      <Text
                        style={[
                          styles.recalCell,
                          styles.recalNum,
                          styles.cellValue,
                        ]}
                      >
                        {r.sample_count}
                      </Text>
                      <View style={[styles.recalCell, styles.recalNum]}>
                        <View
                          style={[
                            styles.chip,
                            {
                              backgroundColor:
                                r.status === "open"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(56, 161, 105, 0.15)",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              {
                                color:
                                  r.status === "open"
                                    ? colors.amber
                                    : colors.success,
                              },
                            ]}
                          >
                            {r.status.toUpperCase()}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.recalCell,
                          styles.recalNum,
                          styles.cellValue,
                          {
                            color: slaOverdue
                              ? colors.danger
                              : slaDays <= 1
                                ? colors.amber
                                : colors.textPrimaryDark,
                          },
                        ]}
                      >
                        {slaOverdue
                          ? `${Math.abs(slaDays)}d overdue`
                          : `${slaDays}d`}
                      </Text>
                      <Text
                        style={[
                          styles.recalCell,
                          styles.recalDate,
                          styles.cellValue,
                        ]}
                      >
                        {formatDate(r.created_at)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Resolve confirmation modal */}
      <AdminModal
        visible={confirmResolve !== null}
        title="Resolve Fraud Flag"
        onClose={() => setConfirmResolve(null)}
        width={420}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmResolve(null)}
              disabled={resolving}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.primary }]}
              onPress={handleResolve}
              disabled={resolving}
            >
              {resolving ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>Resolve</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.confirmText}>
          {confirmResolve
            ? `Resolve flag for ${confirmResolve.driver_name ?? "driver"} (${FLAG_TYPE_CHIP[confirmResolve.flag_type]?.label ?? confirmResolve.flag_type})? This will mark the flag as resolved and clear any package gate.`
            : ""}
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
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
  filterRow: {
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: "rgba(100, 181, 246, 0.12)",
    borderColor: colors.adminAccent,
  },
  filterChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  filterChipTextActive: {
    color: colors.adminAccent,
  },
  flagList: {
    gap: 10,
  },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#181A20",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 14,
  },
  flagMain: {
    flex: 1,
    gap: 6,
  },
  driverName: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
  },
  flagChips: {
    flexDirection: "row",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  chipText: {
    fontFamily: "Jakarta-Bold",
    fontSize: 9,
    letterSpacing: 0.4,
  },
  flagMeta: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  flagActions: {
    marginLeft: 12,
  },
  resolveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  resolveBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  recalRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
    paddingVertical: 10,
    alignItems: "center",
  },
  recalHeader: {
    backgroundColor: "rgba(100, 181, 246, 0.06)",
  },
  recalCell: {
    paddingHorizontal: 8,
  },
  recalZone: { width: 140 },
  recalNum: { width: 90, alignItems: "center" },
  recalDate: { width: 100 },
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
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  modalBtnGhostText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  modalBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  confirmText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    lineHeight: 20,
  },
});
