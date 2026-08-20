// F15-UI-01 Driver Approval Queue
// Admin screen for reviewing pending/temporary/rejected drivers with
// approve / reject / suspend / activate actions and optional vehicle type
// adjustment on approval.
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
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";
import { VEHICLE_TYPES, type VehicleTypeEnum } from "@/lib/vehicleTypes";

type QueueStatus = "pending" | "temporary" | "rejected" | "all";

interface QueueDocument {
  doc_type: string;
  status: string;
  storage_url: string;
  face_match_score: number | null;
  face_match_status: string | null;
}

interface QueueDriver {
  driver_id: string;
  user_id: string;
  name: string | null;
  phone: string | null;
  vehicle_type: VehicleTypeEnum;
  status: string;
  submitted_at: string;
  provisional_expires_at: string | null;
  stage2_due_at: string | null;
  is_legacy_operator: boolean;
  vehicle_registration_date: string | null;
  vehicle_age_years: number | null;
  has_driver_photo: boolean;
  face_match_score: number | null;
  face_match_status: string | null;
  face_match_warning: boolean;
  brta_certificate_url: string | null;
  documents: QueueDocument[];
  sla_hours: number;
  sla_threshold_hours: number;
  sla_breach: boolean;
}

interface QueueResponse {
  drivers: QueueDriver[];
  total: number;
  overdue_count: number;
  fast_track_overdue_count: number;
  face_match_threshold: number;
}

interface ApproveResponse {
  driver_id: string;
  new_status: string;
  provisional_expires_at: string | null;
  vehicle_type_adjusted: boolean;
  adjusted_to: string | null;
}

type ActionKind = "approve" | "reject" | "suspend" | "activate";

interface PendingAction {
  kind: ActionKind;
  driver: QueueDriver;
}

const STATUS_TABS: { key: QueueStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "temporary", label: "Temporary" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

const VEHICLE_OPTIONS = VEHICLE_TYPES.map((v) => ({
  label: v.display_en,
  value: v.key,
}));

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function docSummary(docs: QueueDocument[]): {
  ok: number;
  bad: number;
  wait: number;
} {
  let ok = 0;
  let bad = 0;
  let wait = 0;
  for (const d of docs) {
    if (d.status === "approved") ok++;
    else if (d.status === "rejected") bad++;
    else wait++;
  }
  return { ok, bad, wait };
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case "pending":
      return colors.amber;
    case "temporary":
      return colors.adminAccent;
    case "active":
      return colors.primary;
    case "rejected":
      return colors.danger;
    case "suspended":
      return colors.danger;
    default:
      return colors.grayMedium;
  }
}

export default function QueueScreen() {
  const toast = useAdminToast();
  const [statusFilter, setStatusFilter] = useState<QueueStatus>("pending");
  const [drivers, setDrivers] = useState<QueueDriver[]>([]);
  const [meta, setMeta] = useState<{
    total: number;
    overdue_count: number;
    fast_track_overdue_count: number;
    face_match_threshold: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [detailDriver, setDetailDriver] = useState<QueueDriver | null>(null);
  // Action modal form state
  const [reason, setReason] = useState("");
  const [newStatus, setNewStatus] = useState<"active" | "temporary">("active");
  const [adjustVehicleType, setAdjustVehicleType] = useState(false);
  const [vehicleTypeAdjusted, setVehicleTypeAdjusted] =
    useState<VehicleTypeEnum | null>(null);

  // Track consecutive failures so we can stop auto-refresh when the API is
  // returning errors. This prevents an aggressive retry loop.
  const consecutiveFailuresRef = useRef(0);
  const MAX_CONSECUTIVE_FAILURES = 3;

  // Keep the latest statusFilter and toast in refs so the fetch callback has
  // no external dependencies and is referentially stable.
  const statusFilterRef = useRef(statusFilter);
  statusFilterRef.current = statusFilter;
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const fetchQueue = useCallback(async (status?: QueueStatus) => {
    const target = status ?? statusFilterRef.current;
    setLoading(true);
    const {
      data,
      error,
      status: httpStatus,
    } = await adminFetch<QueueResponse>(
      `/api/admin/queue?status=${encodeURIComponent(target)}&limit=50&offset=0`,
      { method: "GET" },
    );
    if (error || !data) {
      consecutiveFailuresRef.current += 1;
      // Only toast on the first failure of a run — avoid spamming every poll.
      if (consecutiveFailuresRef.current === 1 && httpStatus !== 0) {
        const hint =
          error === "schema_mismatch"
            ? "Database is out of date — push migrations to fix."
            : `Failed to load queue: ${error ?? "unknown"}`;
        toastRef.current.show(hint, "error");
      }
      setDrivers([]);
      setMeta(null);
    } else {
      consecutiveFailuresRef.current = 0;
      setDrivers(data.drivers);
      setMeta({
        total: data.total,
        overdue_count: data.overdue_count,
        fast_track_overdue_count: data.fast_track_overdue_count,
        face_match_threshold: data.face_match_threshold,
      });
    }
    setLoading(false);
  }, []);

  // Fetch on status tab change (resets failure counter).
  useEffect(() => {
    consecutiveFailuresRef.current = 0;
    fetchQueue(statusFilter);
  }, [statusFilter, fetchQueue]);

  // Auto-refresh every 30s. Stops after consecutive failures to avoid
  // hammering a broken endpoint. The interval is set up once and always
  // invokes the latest fetch via closure over the stable callback.
  useEffect(() => {
    const interval = setInterval(() => {
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) return;
      fetchQueue(statusFilterRef.current);
    }, 30_000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const openAction = (kind: ActionKind, driver: QueueDriver) => {
    setReason("");
    setNewStatus("active");
    setAdjustVehicleType(false);
    setVehicleTypeAdjusted(null);
    setPendingAction({ kind, driver });
  };

  const closeAction = () => {
    setPendingAction(null);
    setReason("");
    setAdjustVehicleType(false);
    setVehicleTypeAdjusted(null);
  };

  const [extraActionDriver, setExtraActionDriver] = useState<QueueDriver | null>(null);
  const [extraActionKind, setExtraActionKind] = useState<string>("");
  const [extraVehicleType, setExtraVehicleType] = useState<string>("");
  const [extraReason, setExtraReason] = useState("");

  const openExtraAction = (kind: string, driver: QueueDriver) => {
    setExtraActionDriver(driver);
    setExtraActionKind(kind);
    setExtraVehicleType(driver.vehicle_type ?? "");
    setExtraReason("");
  };

  const submitExtraAction = async () => {
    if (!extraActionDriver || !extraActionKind) return;
    const trimmed = extraReason.trim();
    if (trimmed.length < 10) { toast.show("Reason must be at least 10 characters", "warning"); return; }
    if (extraActionKind === "close_account") {
      const res = await adminFetch<{ success?: boolean }>("/api/admin/driver/close-account", {
        method: "POST", body: JSON.stringify({ driver_id: extraActionDriver.driver_id, reason: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data) { toast.show("Account closed", "success"); setExtraActionDriver(null); fetchQueue(); }
      else { toast.show(res.error ?? "Failed", "error"); }
      return;
    }
    if (extraActionKind === "upgrade") {
      const res = await adminFetch<{ success?: boolean }>("/api/admin/driver/upgrade", {
        method: "POST", body: JSON.stringify({ driver_id: extraActionDriver.driver_id, new_vehicle_type: extraVehicleType, reason: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data) { toast.show("Upgraded", "success"); setExtraActionDriver(null); fetchQueue(); }
      else { toast.show(res.error ?? "Failed", "error"); }
      return;
    }
    if (extraActionKind === "downgrade") {
      const res = await adminFetch<{ success?: boolean }>("/api/admin/driver/downgrade", {
        method: "POST", body: JSON.stringify({ driverId: extraActionDriver.driver_id, new_vehicle_type: extraVehicleType, reason: trimmed }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data) { toast.show("Downgraded", "success"); setExtraActionDriver(null); fetchQueue(); }
      else { toast.show(res.error ?? "Failed", "error"); }
      return;
    }
  };

  const submitAction = async () => {
    if (!pendingAction) return;
    const { kind, driver } = pendingAction;

    if (kind === "approve") {
      const body: Record<string, unknown> = { driver_id: driver.driver_id };
      if (adjustVehicleType && vehicleTypeAdjusted) {
        body.vehicle_type_adjusted = vehicleTypeAdjusted;
      }
      if (newStatus === "temporary") body.new_status = "temporary";
      await runAction(`/api/admin/driver/approve`, body, "Driver approved", {
        json: (d) => {
          const r = d as ApproveResponse;
          return r.vehicle_type_adjusted
            ? `vehicle type adjusted to ${r.adjusted_to ?? "—"}`
            : undefined;
        },
      });
      return;
    }

    if (kind === "activate") {
      await runAction(
        `/api/admin/driver/activate`,
        { driver_id: driver.driver_id },
        "Driver activated",
      );
      return;
    }

    // reject / suspend require reason (10-500)
    const trimmed = reason.trim();
    if (trimmed.length < 10 || trimmed.length > 500) {
      toast.show("Reason must be 10–500 characters", "warning");
      return;
    }
    if (kind === "reject") {
      await runAction(
        `/api/admin/driver/reject`,
        { driver_id: driver.driver_id, reason: trimmed },
        "Driver rejected",
      );
    } else {
      await runAction(
        `/api/admin/driver/suspend`,
        { driver_id: driver.driver_id, reason: trimmed },
        "Driver suspended",
      );
    }
  };

  const runAction = async (
    url: string,
    body: Record<string, unknown>,
    successMsg: string,
    opts?: {
      json?: (d: unknown) => string | undefined;
    },
  ) => {
    if (!pendingAction) return;
    setSubmitting(true);
    const {
      data,
      error,
      message,
      status: httpStatus,
    } = await adminFetch<{
      driver_id?: string;
      status?: string;
      new_status?: string;
      vehicle_type_adjusted?: boolean;
      adjusted_to?: string | null;
    }>(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (error || !data) {
      toast.show(
        httpStatus === 0
          ? "Network error — please retry"
          : message || error || "Action failed",
        "error",
      );
      return;
    }
    const extra = opts?.json?.(data);
    toast.show(extra ? `${successMsg} (${extra})` : successMsg, "success");
    closeAction();
    await fetchQueue(statusFilter);
  };

  const columns: AdminColumn<QueueDriver>[] = [
    {
      key: "name",
      header: "Name",
      width: 180,
      render: (row) => (
        <View>
          <Text style={styles.cellPrimary}>{row.name ?? "—"}</Text>
          {row.is_legacy_operator ? (
            <Text style={styles.cellTag}>legacy operator</Text>
          ) : null}
          {row.face_match_warning ? (
            <Text style={[styles.cellTag, { color: colors.danger }]}>
              face match warning
            </Text>
          ) : null}
        </View>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      width: 130,
      render: (row) => <Text style={styles.cellText}>{row.phone ?? "—"}</Text>,
    },
    {
      key: "vehicle_type",
      header: "Vehicle",
      width: 130,
      render: (row) => (
        <Text style={styles.cellText}>{labelForVehicle(row.vehicle_type)}</Text>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 110,
      render: (row) => (
        <View
          style={[
            styles.badge,
            { backgroundColor: statusBadgeColor(row.status) + "22" },
          ]}
        >
          <Text
            style={[styles.badgeText, { color: statusBadgeColor(row.status) }]}
          >
            {row.status}
          </Text>
        </View>
      ),
    },
    {
      key: "docs",
      header: "Docs",
      width: 120,
      render: (row) => {
        const s = docSummary(row.documents);
        return (
          <Text style={styles.cellText}>
            <Text style={{ color: colors.primary }}>{s.ok} </Text>
            <Text style={{ color: colors.danger }}>{s.bad}</Text>
            <Text style={{ color: colors.amber }}> {s.wait}</Text>
          </Text>
        );
      },
    },
    {
      key: "submitted_at",
      header: "Submitted",
      width: 160,
      render: (row) => (
        <Text style={styles.cellText}>{formatDateTime(row.submitted_at)}</Text>
      ),
    },
    {
      key: "sla_hours",
      header: "SLA",
      width: 90,
      sortable: true,
      render: (row) => (
        <Text
          style={[
            styles.cellText,
            row.sla_breach && {
              color: colors.danger,
              fontFamily: "Jakarta-SemiBold",
            },
          ]}
        >
          {row.sla_hours.toFixed(1)}h{row.sla_breach ? " (!)" : ""}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 320,
      render: (row) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.primary }]}
            onPress={(e) => {
              e.stopPropagation();
              openAction("approve", row);
            }}
          >
            <Text style={styles.miniBtnText}>Approve</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.danger }]}
            onPress={(e) => {
              e.stopPropagation();
              openAction("reject", row);
            }}
          >
            <Text style={styles.miniBtnText}>Reject</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.amber }]}
            onPress={(e) => {
              e.stopPropagation();
              openAction("suspend", row);
            }}
          >
            <Text style={styles.miniBtnText}>Suspend</Text>
          </Pressable>
          {row.status === "temporary" ? (
            <Pressable
              style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
              onPress={(e) => {
                e.stopPropagation();
                openAction("activate", row);
              }}
            >
              <Text style={styles.miniBtnText}>Activate</Text>
            </Pressable>
          ) : null}
          {row.status === "active" ? (<>
            <Pressable
              style={[styles.miniBtn, { backgroundColor: colors.primary }]}
              onPress={(e) => {
                e.stopPropagation();
                openExtraAction("upgrade", row);
              }}
            >
              <Text style={styles.miniBtnText}>Upgrade</Text>
            </Pressable>
            <Pressable
              style={[styles.miniBtn, { backgroundColor: colors.amber }]}
              onPress={(e) => {
                e.stopPropagation();
                openExtraAction("downgrade", row);
              }}
            >
              <Text style={styles.miniBtnText}>Downgrade</Text>
            </Pressable>
            <Pressable
              style={[styles.miniBtn, { backgroundColor: colors.danger }]}
              onPress={(e) => {
                e.stopPropagation();
                openExtraAction("close_account", row);
              }}
            >
              <Text style={styles.miniBtnText}>Close</Text>
            </Pressable>
          </>) : null}
        </View>
      ),
    },
  ];

  const subtitle = meta
    ? `${meta.total} in queue · ${meta.overdue_count} overdue${
        meta.fast_track_overdue_count
          ? ` · ${meta.fast_track_overdue_count} fast-track overdue`
          : ""
      }`
    : undefined;

  return (
    <AdminShell
      title="Driver Approval Queue"
      subtitle={subtitle}
      actions={
        <Pressable
          style={styles.refreshBtn}
          onPress={() => fetchQueue(statusFilter)}
        >
          <Text style={styles.refreshBtnText}>Refresh</Text>
        </Pressable>
      }
    >
      <View style={styles.tabsRow}>
        {STATUS_TABS.map((tab) => {
          const active = tab.key === statusFilter;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setStatusFilter(tab.key)}
              style={[styles.tabChip, active && styles.tabChipActive]}
            >
              <Text
                style={[styles.tabChipText, active && styles.tabChipTextActive]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {meta ? (
        <View style={styles.kpisRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Face match threshold</Text>
            <Text style={styles.kpiValue}>{meta.face_match_threshold}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Overdue (standard)</Text>
            <Text style={[styles.kpiValue, { color: colors.danger }]}>
              {meta.overdue_count}
            </Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Overdue (fast-track)</Text>
            <Text style={[styles.kpiValue, { color: colors.danger }]}>
              {meta.fast_track_overdue_count}
            </Text>
          </View>
        </View>
      ) : null}

      <AdminTable
        columns={columns}
        rows={drivers}
        rowKey={(row) => row.driver_id}
        onRowPress={(row) => setDetailDriver(row)}
        loading={loading}
        emptyMessage="No drivers in this queue"
        pagination={null}
      />

      {/* Action confirm modal */}
      <AdminModal
        visible={!!pendingAction}
        title={
          pendingAction
            ? actionTitle(pendingAction.kind, pendingAction.driver)
            : ""
        }
        onClose={closeAction}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={closeAction}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                {
                  backgroundColor: actionColor(pendingAction?.kind),
                },
              ]}
              onPress={submitAction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>
                  {pendingAction ? actionVerb(pendingAction.kind) : ""}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        {pendingAction ? (
          <View style={{ gap: 14 }}>
            <View style={styles.actionSummaryCard}>
              <Row label="Driver" value={pendingAction.driver.name ?? "—"} />
              <Row label="Phone" value={pendingAction.driver.phone ?? "—"} />
              <Row
                label="Vehicle"
                value={labelForVehicle(pendingAction.driver.vehicle_type)}
              />
              <Row label="Status" value={pendingAction.driver.status} />
              <Row
                label="Submitted"
                value={formatDateTime(pendingAction.driver.submitted_at)}
              />
              <Row
                label="Face match"
                value={
                  pendingAction.driver.face_match_score !== null
                    ? `${pendingAction.driver.face_match_score.toFixed(2)}${
                        pendingAction.driver.face_match_status
                          ? ` (${pendingAction.driver.face_match_status})`
                          : ""
                      }${
                        pendingAction.driver.face_match_warning
                          ? " (!) below threshold"
                          : ""
                      }`
                    : "—"
                }
              />
              <Row
                label="Vehicle age"
                value={
                  pendingAction.driver.vehicle_age_years !== null
                    ? `${pendingAction.driver.vehicle_age_years.toFixed(1)} yrs`
                    : "—"
                }
              />
            </View>

            {pendingAction.kind === "approve" ? (
              <View style={{ gap: 14 }}>
                <View style={styles.fieldRow}>
                  <Text style={styles.fieldLabel}>FINAL STATUS</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable
                      onPress={() => setNewStatus("active")}
                      style={[
                        styles.statusChoice,
                        newStatus === "active" && styles.statusChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChoiceText,
                          newStatus === "active" &&
                            styles.statusChoiceTextActive,
                        ]}
                      >
                        Active
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setNewStatus("temporary")}
                      style={[
                        styles.statusChoice,
                        newStatus === "temporary" && styles.statusChoiceActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusChoiceText,
                          newStatus === "temporary" &&
                            styles.statusChoiceTextActive,
                        ]}
                      >
                        Temporary
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.fieldRow}>
                  <AdminToggle
                    value={adjustVehicleType}
                    onValueChange={setAdjustVehicleType}
                    label="Adjust vehicle type"
                  />
                </View>

                {adjustVehicleType ? (
                  <View style={styles.vehicleGrid}>
                    {VEHICLE_OPTIONS.map((opt) => {
                      const selected = vehicleTypeAdjusted === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() =>
                            setVehicleTypeAdjusted(opt.value as VehicleTypeEnum)
                          }
                          style={[
                            styles.vehicleChip,
                            selected && styles.vehicleChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.vehicleChipText,
                              selected && styles.vehicleChipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            ) : null}

            {pendingAction.kind === "reject" ||
            pendingAction.kind === "suspend" ? (
              <View style={{ gap: 6 }}>
                <Text style={styles.fieldLabel}>REASON (10–500 CHARS) *</Text>
                <textarea
                  value={reason}
                  onChange={(e: { target: { value: string } }) =>
                    setReason(e.target.value)
                  }
                  rows={4}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #2A2D35",
                    backgroundColor: "#181A20",
                    color: "#FFFFFF",
                    fontFamily: "Jakarta-Regular",
                    fontSize: "14px",
                    resize: "vertical",
                  }}
                  placeholder="Provide a clear reason for the driver. Visible in audit trail."
                />
                <Text style={styles.helperText}>
                  {reason.trim().length} chars
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </AdminModal>

      {/* Detail drawer */}
      <AdminModal
        visible={!!detailDriver}
        title={detailDriver?.name ?? "Driver detail"}
        onClose={() => setDetailDriver(null)}
        width={720}
      >
        {detailDriver ? (
          <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 12 }}>
            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Profile</Text>
              <Row label="Driver ID" value={detailDriver.driver_id} />
              <Row label="User ID" value={detailDriver.user_id} />
              <Row label="Phone" value={detailDriver.phone ?? "—"} />
              <Row
                label="Vehicle"
                value={labelForVehicle(detailDriver.vehicle_type)}
              />
              <Row label="Status" value={detailDriver.status} />
              <Row
                label="Submitted"
                value={formatDateTime(detailDriver.submitted_at)}
              />
              <Row
                label="Provisional expires"
                value={formatDateTime(detailDriver.provisional_expires_at)}
              />
              <Row
                label="Stage 2 due"
                value={formatDateTime(detailDriver.stage2_due_at)}
              />
              <Row
                label="Vehicle age"
                value={
                  detailDriver.vehicle_age_years !== null
                    ? `${detailDriver.vehicle_age_years.toFixed(1)} yrs`
                    : "—"
                }
              />
              <Row
                label="Legacy operator"
                value={detailDriver.is_legacy_operator ? "Yes" : "No"}
              />
              <Row
                label="Face match"
                value={
                  detailDriver.face_match_score !== null
                    ? `${detailDriver.face_match_score.toFixed(2)}${
                        detailDriver.face_match_status
                          ? ` (${detailDriver.face_match_status})`
                          : ""
                      }`
                    : "—"
                }
              />
              <Row
                label="SLA"
                value={`${detailDriver.sla_hours.toFixed(1)}h / ${
                  detailDriver.sla_threshold_hours
                }h${detailDriver.sla_breach ? " (!) breach" : ""}`}
              />
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>
                Documents ({detailDriver.documents.length})
              </Text>
              {detailDriver.documents.length === 0 ? (
                <Text style={styles.emptyDocs}>No documents submitted</Text>
              ) : (
                <View style={styles.docGrid}>
                  {detailDriver.documents.map((doc, idx) => (
                    <View key={`${doc.doc_type}-${idx}`} style={styles.docCard}>
                      <Text style={styles.docType}>
                        {doc.doc_type.replace(/_/g, " ")}
                      </Text>
                      <View
                        style={[
                          styles.badge,
                          {
                            backgroundColor:
                              statusBadgeColor(doc.status) + "22",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.badgeText,
                            { color: statusBadgeColor(doc.status) },
                          ]}
                        >
                          {doc.status}
                        </Text>
                      </View>
                      {doc.face_match_score !== null ? (
                        <Text style={styles.docMeta}>
                          face: {doc.face_match_score.toFixed(2)}
                          {doc.face_match_status
                            ? ` · ${doc.face_match_status}`
                            : ""}
                        </Text>
                      ) : null}
                      <Text style={styles.docUrl} numberOfLines={1}>
                        {doc.storage_url}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        ) : null}
      </AdminModal>

      {extraActionDriver && (
        <AdminModal visible title={extraActionKind === "close_account" ? "Close Account" : extraActionKind === "upgrade" ? "Upgrade Vehicle" : "Downgrade Vehicle"} onClose={() => setExtraActionDriver(null)}>
          <View style={{ gap: 12 }}>
            {extraActionKind !== "close_account" ? (
              <View>
                <Text style={styles.fieldLabel}>New vehicle type</Text>
                <View style={styles.vehicleGrid}>
                  {VEHICLE_OPTIONS.map((o) => (
                    <Pressable key={o.value} style={[styles.vehicleChip, extraVehicleType === o.value && styles.vehicleChipActive]}
                      onPress={() => setExtraVehicleType(o.value)}>
                      <Text style={[styles.vehicleChipText, extraVehicleType === o.value && styles.vehicleChipTextActive]}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <Row label="Driver" value={extraActionDriver.name ?? "—"} />
                <Row label="Vehicle" value={extraActionDriver.vehicle_type} />
                <Text style={{ ...styles.helperText, marginTop: 8 }}>This will mark the driver as rejected and schedule document purge in 30 days.</Text>
              </View>
            )}
            <Text style={styles.fieldLabel}>Reason (min 10 chars)</Text>
            <View style={styles.reasonInput}>
              <input type="text" value={extraReason} onChange={(e) => setExtraReason(e.target.value)} maxLength={500}
                style={{ background: "transparent", color: "white", border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 13 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
              <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setExtraActionDriver(null)}>
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.modalBtn, { backgroundColor: extraActionKind === "close_account" ? colors.danger : colors.adminAccent }]} onPress={submitExtraAction}>
                <Text style={styles.modalBtnText}>{extraActionKind === "close_account" ? "Close Account" : extraActionKind === "upgrade" ? "Upgrade" : "Downgrade"}</Text>
              </Pressable>
            </View>
          </View>
        </AdminModal>
      )}
    </AdminShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowLine}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function actionTitle(kind: ActionKind, driver: QueueDriver): string {
  const name = driver.name ?? driver.driver_id.slice(0, 8);
  switch (kind) {
    case "approve":
      return `Approve ${name}`;
    case "reject":
      return `Reject ${name}`;
    case "suspend":
      return `Suspend ${name}`;
    case "activate":
      return `Activate ${name}`;
  }
}

function actionVerb(kind: ActionKind): string {
  switch (kind) {
    case "approve":
      return "Approve";
    case "reject":
      return "Reject";
    case "suspend":
      return "Suspend";
    case "activate":
      return "Activate";
  }
}

function actionColor(kind?: ActionKind): string {
  switch (kind) {
    case "approve":
      return colors.primary;
    case "reject":
      return colors.danger;
    case "suspend":
      return colors.amber;
    case "activate":
      return colors.adminAccent;
    default:
      return colors.grayMedium;
  }
}

function labelForVehicle(key: VehicleTypeEnum): string {
  return VEHICLE_TYPES.find((v) => v.key === key)?.display_en ?? key;
}

const styles = StyleSheet.create({
  tabsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  tabChipActive: {
    backgroundColor: colors.adminAccent,
    borderColor: colors.adminAccent,
  },
  tabChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  tabChipTextActive: {
    color: colors.white,
  },
  kpisRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 14,
  },
  kpi: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 160,
  },
  kpiLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  kpiValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
    marginTop: 2,
  },
  cellPrimary: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  cellText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  cellTag: {
    color: colors.amber,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 2,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  miniBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  miniBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  refreshBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  actionSummaryCard: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  rowLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    gap: 12,
  },
  rowLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  rowValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    flexShrink: 1,
    textAlign: "right",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statusChoice: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  statusChoiceActive: {
    backgroundColor: colors.adminAccent,
    borderColor: colors.adminAccent,
  },
  statusChoiceText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  statusChoiceTextActive: {
    color: colors.white,
  },
  vehicleGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  vehicleChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  vehicleChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  vehicleChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  vehicleChipTextActive: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
  },
  reasonInput: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 10,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
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
  helperText: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  detailSection: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 10,
    padding: 12,
    gap: 2,
  },
  detailSectionTitle: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    marginBottom: 6,
  },
  emptyDocs: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    paddingVertical: 8,
  },
  docGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  docCard: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 10,
    width: 200,
    gap: 4,
  },
  docType: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    textTransform: "capitalize",
  },
  docMeta: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
  docUrl: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
  },
});
