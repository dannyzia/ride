/**
 * Admin — Vehicle Type Change Queue (S7 §7 / F-30 E2 completion).
 *
 * The admin side of the F-22 driver request. Approve applies the change to the
 * driver AND the vehicle record in one transaction; Reject requires the F-30
 * structured reason (code + failed field + an acceptable example) plus an
 * admin-only internal note, exactly like the verification queue it sits beside.
 *
 * Route: /admin/vehicle-type-changes
 * RBAC: list = admin.read (ops_manager/moderator read-only); decide =
 * verification.write, enforced server-side.
 */
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, ScrollView } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";

interface ChangeRow {
  change_id: string;
  driver_id: string;
  driver_name: string | null;
  driver_phone: string | null;
  old_vehicle_type: string;
  new_vehicle_type: string;
  change_reason: string;
  reason_text: string;
  status: string;
  effective_at: string | null;
  created_at: string;
  current_vehicle_type: string;
}

const REJECT_CODES = [
  { code: "unreadable", label: "Unreadable" },
  { code: "expired", label: "Expired" },
  { code: "mismatch", label: "Info mismatch" },
  { code: "not_eligible", label: "Not eligible for that class" },
  { code: "insufficient_proof", label: "Insufficient proof" },
];

const STATUS_FILTERS = ["pending", "approved", "rejected", "all"];

function labelForVehicle(key: string): string {
  return VEHICLE_TYPES.find((v) => v.key === key)?.display_en ?? key;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function VehicleTypeChangesScreen() {
  const toast = useAdminToast();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ChangeRow | null>(null);
  const [rejectCode, setRejectCode] = useState("");
  const [rejectField, setRejectField] = useState("");
  const [rejectExample, setRejectExample] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error, message } = await adminFetch<{ changes: ChangeRow[] }>(
      `/api/admin/driver/type-changes?status=${status}`,
    );
    setLoading(false);
    if (error || !data) {
      setRows([]);
      toast.show(message || error || "Failed to load the queue", "error");
      return;
    }
    setRows(data.changes);
  }, [status, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const resetRejectForm = () => {
    setRejecting(null);
    setRejectCode("");
    setRejectField("");
    setRejectExample("");
    setRejectReason("");
    setRejectNote("");
  };

  const decide = async (row: ChangeRow, action: "approve" | "reject") => {
    setBusyId(row.change_id);
    const body =
      action === "approve"
        ? { change_id: row.change_id, action }
        : {
            change_id: row.change_id,
            action,
            reason: rejectReason.trim() || undefined,
            code: rejectCode || undefined,
            field: rejectField.trim() || undefined,
            example: rejectExample.trim() || undefined,
            internal_note: rejectNote.trim() || undefined,
          };
    const { error, message } = await adminFetch("/api/admin/driver/type-change-approve", {
      method: "POST",
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (error) {
      toast.show(message || error, "error");
      return;
    }
    if (action === "approve") {
      // The change is applied server-side; drop it from the pending view.
      setRows((prev) => prev.filter((r) => r.change_id !== row.change_id));
      toast.show("Approved — driver + vehicle updated", "success");
    } else {
      resetRejectForm();
      load();
      toast.show("Rejected — the reason is visible to the driver", "info");
    }
  };

  const submitReject = () => {
    if (!rejecting) return;
    if (rejectReason.trim().length < 5 || !rejectCode || rejectField.trim().length < 2 || rejectExample.trim().length < 5) {
      toast.show(
        "Structured reason required: code + failed field + an acceptable example",
        "warning",
      );
      return;
    }
    decide(rejecting, "reject");
  };

  const columns: AdminColumn<ChangeRow>[] = [
    {
      key: "driver_name",
      header: "Driver",
      width: 200,
      render: (row) => (
        <Text style={styles.cellPrimary}>
          {row.driver_name ?? row.driver_id.slice(0, 8)}
          {"\n"}
          <Text style={styles.subText}>{row.driver_phone ?? "—"}</Text>
        </Text>
      ),
    },
    {
      key: "new_vehicle_type",
      header: "Change",
      width: 220,
      render: (row) => (
        <Text style={styles.cellText}>
          {labelForVehicle(row.old_vehicle_type)} → {labelForVehicle(row.new_vehicle_type)}
        </Text>
      ),
    },
    {
      key: "current_vehicle_type",
      header: "Live now",
      width: 150,
      render: (row) => (
        <Text style={styles.cellText}>{labelForVehicle(row.current_vehicle_type)}</Text>
      ),
    },
    {
      key: "reason_text",
      header: "Driver's reason",
      width: 240,
      render: (row) => (
        <Text style={styles.subText} numberOfLines={3}>
          {row.reason_text}
        </Text>
      ),
    },
    {
      key: "created_at",
      header: "Requested",
      width: 170,
      render: (row) => <Text style={styles.cellText}>{formatDateTime(row.created_at)}</Text>,
    },
    {
      key: "effective_at",
      header: "Decided",
      width: 170,
      render: (row) => <Text style={styles.cellText}>{formatDateTime(row.effective_at)}</Text>,
    },
    {
      key: "change_id",
      header: "Actions",
      width: 190,
      render: (row) => (
        <ActionCell
          row={row}
          busy={busyId === row.change_id}
          onApprove={() => decide(row, "approve")}
          onReject={() => setRejecting(row)}
        />
      ),
    },
  ];

  return (
    <AdminShell
      title="Vehicle Type Changes"
      subtitle="Driver-initiated class changes — approve applies it to the driver and the vehicle"
      actions={
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map((s) => (
            <Pressable
              key={s}
              onPress={() => setStatus(s)}
              style={[styles.filterChip, s === status && styles.filterChipActive]}
             
             testID="admin.vehicle-type-changes.set-status">
              <Text style={[styles.filterText, s === status && styles.filterTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.change_id}
        loading={loading}
        emptyMessage="No vehicle type changes for this filter"
        pagination={null}
      />

      <AdminModal
        visible={rejecting !== null}
        title="Reject vehicle type change"
        onClose={resetRejectForm}
        footer={
          <>
            <Pressable style={styles.btnGhost} onPress={resetRejectForm} testID="admin.vehicle-type-changes.reset-reject-form">
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.btnDanger} onPress={submitReject} testID="admin.vehicle-type-changes.submit-reject">
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </>
        }
      >
        <Text style={styles.modalHint}>
          The driver sees the reason below in-app and can request the change again. The field and
          example are what they resubmit against.
        </Text>
        <Text style={styles.fieldLabel}>Reason code</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {REJECT_CODES.map((c) => (
            <Pressable
              key={c.code}
              onPress={() => setRejectCode(c.code)}
              style={[styles.filterChip, c.code === rejectCode && styles.filterChipActive]}
             
             testID="admin.vehicle-type-changes.set-reject-code">
              <Text style={[styles.filterText, c.code === rejectCode && styles.filterTextActive]}>
                {c.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.fieldLabel}>Reason (driver-visible)</Text>
        <TextInput
          value={rejectReason}
          onChangeText={setRejectReason}
          placeholder="Why this change cannot be approved"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
          multiline
         
         testID="admin.vehicle-type-changes.set-reject-reason"/>
        <Text style={styles.fieldLabel}>Failed field</Text>
        <TextInput
          value={rejectField}
          onChangeText={setRejectField}
          placeholder="e.g. vehicle registration document"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
         
         testID="admin.vehicle-type-changes.set-reject-field"/>
        <Text style={styles.fieldLabel}>Acceptable example</Text>
        <TextInput
          value={rejectExample}
          onChangeText={setRejectExample}
          placeholder="What a valid request looks like"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
          multiline
         
         testID="admin.vehicle-type-changes.set-reject-example"/>
        <Text style={styles.fieldLabel}>Internal note (admin-only)</Text>
        <TextInput
          value={rejectNote}
          onChangeText={setRejectNote}
          placeholder="Never shown to the driver"
          placeholderTextColor={colors.textDisabledDark}
          style={styles.input}
         
         testID="admin.vehicle-type-changes.set-reject-note"/>
      </AdminModal>
    </AdminShell>
  );
}

function ActionCell({
  row,
  busy,
  onApprove,
  onReject,
}: {
  row: ChangeRow;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (row.status !== "pending") {
    return <Text style={styles.subText}>{row.status} — decided</Text>;
  }
  if (busy) return <ActivityIndicator color={colors.adminAccent} size="small" />;
  return (
    <>
      <Pressable
        style={[styles.btnPrimary, styles.btnInline]}
        onPress={onApprove}
       
       testID="admin.vehicle-type-changes.on-approve">
        <Text style={styles.btnText}>Approve</Text>
      </Pressable>
      <Pressable
        style={[styles.btnDanger, styles.btnInline]}
        onPress={onReject}
       
       testID="admin.vehicle-type-changes.on-reject">
        <Text style={styles.btnText}>Reject</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 8, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: colors.darkSecondary,
  },
  filterChipActive: { backgroundColor: colors.adminAccent, borderColor: colors.adminAccent },
  filterText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 },
  filterTextActive: { color: colors.white },
  cellPrimary: { color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  cellText: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13 },
  subText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 },
  modalHint: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginBottom: 12,
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    minHeight: 42,
  },
  btnPrimary: {
    backgroundColor: colors.adminAccent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnDanger: {
    backgroundColor: colors.danger,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  btnGhostText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  btnInline: { marginTop: 4, alignSelf: "flex-start" },
  btnText: { color: colors.white, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
});
