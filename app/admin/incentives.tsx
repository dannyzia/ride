// F15-UI-05 Driver Incentives Management
// Admin CRUD for performance-based reward programs. Drivers hit a target metric
// (completed_rides / online_hours / acceptance_rate / consecutive_accepts) and
// receive a grant of reward_calls (free call credits) on completion.
//
// Schema: incentiveDefinitions (src/db/schema.ts L883). target_value is numeric
// in Postgres but is treated as a JS number on this screen.
// API:    app/api/admin/incentives+api.ts (POST/PATCH/DELETE). GET is targeted
// at the natural REST path; if absent, the list shows empty with a toast.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminForm, type AdminField } from "@/components/admin/AdminForm";
import { AdminToggle } from "@/components/admin/AdminToggle";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";
import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_VALUES,
  type VehicleTypeEnum,
} from "@/lib/vehicleTypes";

type TargetMetric =
  | "completed_rides"
  | "online_hours"
  | "acceptance_rate"
  | "consecutive_accepts";

// "all" is a UI-only sentinel meaning no vehicle_type_filter (NULL in DB).
type VehicleFilterValue = VehicleTypeEnum | "all";

interface Incentive {
  id: string;
  name: string;
  description: string | null;
  target_metric: TargetMetric;
  // numeric column comes back as string from drizzle; normalize at fetch.
  target_value: string | number;
  reward_calls: number;
  vehicle_type_filter: VehicleTypeEnum | null;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface IncentivesResponse {
  incentives?: Incentive[];
}

interface IncentiveResponse {
  incentive?: Incentive;
  incentive_id?: string;
}

type Mode = "create" | "edit";
type FilterChip = "all" | "active" | "inactive";

const TARGET_METRIC_OPTIONS: { label: string; value: TargetMetric }[] = [
  { label: "Completed Rides", value: "completed_rides" },
  { label: "Online Hours", value: "online_hours" },
  { label: "Acceptance Rate", value: "acceptance_rate" },
  { label: "Consecutive Accepts", value: "consecutive_accepts" },
];

const VEHICLE_FILTER_OPTIONS: { label: string; value: VehicleFilterValue }[] = [
  { label: "All", value: "all" },
  ...VEHICLE_TYPE_VALUES.map((v) => {
    const def = VEHICLE_TYPES.find((d) => d.key === v);
    return { label: def?.display_en ?? v, value: v };
  }),
];

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  description: "",
  target_metric: "completed_rides" as TargetMetric,
  target_value: 10,
  reward_calls: 5,
  vehicle_type_filter: "all" as VehicleFilterValue,
  starts_at: null as string | null,
  ends_at: null as string | null,
  is_active: true,
};

const METRIC_LABEL: Record<TargetMetric, string> = {
  completed_rides: "Completed Rides",
  online_hours: "Online Hours",
  acceptance_rate: "Acceptance Rate",
  consecutive_accepts: "Consecutive Accepts",
};

export default function IncentivesScreen() {
  const toast = useAdminToast();
  const [incentives, setIncentives] = useState<Incentive[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [filterChip, setFilterChip] = useState<FilterChip>("all");
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] = useState<Incentive | null>(
    null,
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<IncentivesResponse>(
      "/api/admin/incentives",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load incentives: ${error ?? "unknown"}`, "error");
      }
      setIncentives([]);
    } else {
      setIncentives(data.incentives ?? []);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalVisible(true);
  };

  const openEdit = (i: Incentive) => {
    setMode("edit");
    setEditingId(i.id);
    setForm({
      name: i.name,
      description: i.description ?? "",
      target_metric: i.target_metric,
      target_value: Number(i.target_value),
      reward_calls: i.reward_calls,
      vehicle_type_filter: (i.vehicle_type_filter ??
        "all") as VehicleFilterValue,
      starts_at: i.starts_at,
      ends_at: i.ends_at,
      is_active: i.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const buildPayload = () => {
    const name = String(form.name ?? "").trim();
    if (!name) {
      toast.show("Name is required", "error");
      return null;
    }
    const targetValue = Number(form.target_value);
    if (!Number.isFinite(targetValue) || targetValue <= 0) {
      toast.show("Target value must be a positive number", "error");
      return null;
    }
    const rewardCalls = Number(form.reward_calls);
    if (
      !Number.isFinite(rewardCalls) ||
      rewardCalls < 1 ||
      !Number.isInteger(rewardCalls)
    ) {
      toast.show("Reward calls must be a positive integer", "error");
      return null;
    }
    const startsAt = form.starts_at as string | null;
    const endsAt = form.ends_at as string | null;
    if (!startsAt || !endsAt) {
      toast.show("Start and end datetimes are required", "error");
      return null;
    }
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      toast.show("End datetime must be after start datetime", "error");
      return null;
    }
    const targetMetric = form.target_metric as TargetMetric;
    const vf = form.vehicle_type_filter as VehicleFilterValue;
    return {
      name,
      description: (String(form.description ?? "").trim() || undefined) ?? null,
      target_metric: targetMetric,
      target_value: targetValue,
      reward_calls: rewardCalls,
      vehicle_type_filter: vf === "all" ? null : (vf as VehicleTypeEnum),
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<IncentiveResponse>(
          "/api/admin/incentives",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Incentive created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<IncentiveResponse>(
          `/api/admin/incentives?id=${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Incentive updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (i: Incentive) => {
    const next = !i.is_active;
    const { error } = await adminFetch<IncentiveResponse>(
      `/api/admin/incentives?id=${encodeURIComponent(i.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(
      next ? "Incentive activated" : "Incentive deactivated",
      "success",
    );
    await fetchList();
  };

  const openDeactivate = (i: Incentive) => {
    if (!i.is_active) {
      toast.show("Incentive is already inactive", "info");
      return;
    }
    setConfirmDeactivate(i);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<IncentiveResponse>(
        `/api/admin/incentives?id=${encodeURIComponent(confirmDeactivate.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: false }),
        },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Incentive deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const filteredIncentives = incentives.filter((i) => {
    if (filterChip === "active") return i.is_active;
    if (filterChip === "inactive") return !i.is_active;
    return true;
  });

  const fields: AdminField[] = [
    {
      name: "name",
      label: "Name",
      type: "text",
      required: true,
      placeholder: "e.g. Weekend Warrior Bonus",
    },
    {
      name: "description",
      label: "Description",
      type: "textarea",
      placeholder: "Internal notes about this incentive",
    },
    {
      name: "target_metric",
      label: "Target Metric",
      type: "select",
      required: true,
      options: TARGET_METRIC_OPTIONS,
    },
    {
      name: "target_value",
      label: "Target Value",
      type: "number",
      required: true,
      step: 1,
      helpText:
        "Threshold the driver must reach (rides count, hours, rate %, or streak).",
    },
    {
      name: "reward_calls",
      label: "Reward (free calls granted)",
      type: "number",
      required: true,
      step: 1,
      helpText: "Integer number of call credits granted on completion.",
    },
    {
      name: "vehicle_type_filter",
      label: "Vehicle Type Filter",
      type: "select",
      options: VEHICLE_FILTER_OPTIONS,
      helpText: "Restrict eligibility to one vehicle type, or All.",
    },
    {
      name: "starts_at",
      label: "Starts At",
      type: "datetime",
      required: true,
    },
    {
      name: "ends_at",
      label: "Ends At",
      type: "datetime",
      required: true,
    },
    { name: "is_active", label: "Active", type: "boolean" },
  ];

  const columns: AdminColumn<Incentive>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (i) => <Text style={styles.cellPrimary}>{i.name}</Text>,
    },
    {
      key: "target_metric",
      header: "Target / Metric",
      width: 220,
      render: (i) => (
        <Text style={styles.cellText}>
          {METRIC_LABEL[i.target_metric]}: {String(i.target_value)}
        </Text>
      ),
    },
    {
      key: "reward_calls",
      header: "Reward",
      width: 120,
      sortable: true,
      render: (i) => (
        <Text style={styles.cellText}>{i.reward_calls} calls</Text>
      ),
    },
    {
      key: "vehicle_type_filter",
      header: "Vehicle Filter",
      width: 140,
      render: (i) => {
        if (!i.vehicle_type_filter) {
          return <Text style={styles.cellMuted}>All</Text>;
        }
        const def = VEHICLE_TYPES.find((d) => d.key === i.vehicle_type_filter);
        return (
          <Text style={styles.cellText}>
            {def?.display_en ?? i.vehicle_type_filter}
          </Text>
        );
      },
    },
    {
      key: "is_active",
      header: "Active",
      width: 90,
      render: (i) => (
        <AdminToggle
          value={i.is_active}
          onValueChange={() => handleToggleActive(i)}
        />
      ),
    },
    {
      key: "starts_at",
      header: "Valid Window",
      width: 280,
      render: (i) => (
        <Text style={styles.cellText}>
          {new Date(i.starts_at).toLocaleString()} →{"\n"}
          {new Date(i.ends_at).toLocaleString()}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (i) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(i)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[
              styles.miniBtn,
              {
                backgroundColor: colors.danger,
                opacity: i.is_active ? 1 : 0.4,
              },
            ]}
            onPress={() => openDeactivate(i)}
            disabled={!i.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  const chipStyle = (chip: FilterChip) => [
    styles.chip,
    filterChip === chip ? styles.chipActive : null,
  ];
  const chipTextStyle = (chip: FilterChip) => [
    styles.chipText,
    filterChip === chip ? styles.chipTextActive : null,
  ];

  return (
    <AdminShell
      title="Driver Incentives"
      subtitle="Performance-based reward programs"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Incentive</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.chipRow}>
        {(["all", "active", "inactive"] as FilterChip[]).map((chip) => (
          <Pressable
            key={chip}
            onPress={() => setFilterChip(chip)}
            style={chipStyle(chip)}
          >
            <Text style={chipTextStyle(chip)}>
              {chip === "all"
                ? "All"
                : chip === "active"
                  ? "Active"
                  : "Inactive"}
            </Text>
          </Pressable>
        ))}
      </View>

      <AdminTable
        columns={columns}
        rows={filteredIncentives}
        rowKey={(i) => i.id}
        loading={loading}
        emptyMessage="No incentives match this filter."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Incentive" : "Edit Incentive"}
        onClose={closeModal}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={closeModal}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={handleSave}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>
                  {mode === "create" ? "Create" : "Save"}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <AdminForm fields={fields} values={form} onChange={setForm} />
      </AdminModal>

      <AdminModal
        visible={!!confirmDeactivate}
        title="Deactivate incentive"
        onClose={() => !submitting && setConfirmDeactivate(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmDeactivate(null)}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.danger }]}
              onPress={confirmDeactivateAction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>Deactivate</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.confirmText}>
          {`Deactivate "${confirmDeactivate?.name ?? ""}"? Eligible drivers will no longer accumulate progress toward this reward.`}
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
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
  cellMuted: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  chipActive: {
    backgroundColor: colors.adminAccent,
    borderColor: colors.adminAccent,
  },
  chipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  chipTextActive: { color: colors.white },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  primaryBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  ghostBtn: {
    backgroundColor: colors.darkSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
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
  modalBtnPrimary: { backgroundColor: colors.adminAccent },
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
