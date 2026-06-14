// F15-UI-02 Call Packages Management
// Admin CRUD for driver subscription packages. Prices stored as integer paisa;
// the form works in taka and converts ×100 on save, ÷100 on load.
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
import { VEHICLE_TYPES, type VehicleTypeEnum } from "@/lib/vehicleTypes";

interface Package {
  id: string;
  name: string;
  call_count: number;
  duration_days: number;
  price_bdt: number; // integer paisa
  is_trial: boolean;
  daily_cap: number;
  is_active: boolean;
  vehicle_type: VehicleTypeEnum | null;
  created_at: string;
  updated_at: string;
}

interface PackagesResponse {
  packages: Package[];
}

interface PackageResponse {
  package: Package;
}

type Mode = "create" | "edit";

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  call_count: 100,
  duration_days: 30,
  price_bdt_taka: 100, // taka (×100 → paisa on save)
  daily_cap: 200,
  is_trial: false,
  is_active: true,
  vehicle_type: "", // "" = all vehicle types (NULL in DB)
};

// Options for the vehicle-type select field.
// "" represents NULL (universal package).
const VEHICLE_TYPE_OPTIONS = [
  { label: "All Types", value: "" },
  ...VEHICLE_TYPES.map((v) => ({ label: v.display_en, value: v.key })),
];

function vehicleLabel(vt: VehicleTypeEnum | null | undefined): string {
  if (!vt) return "All";
  return VEHICLE_TYPES.find((v) => v.key === vt)?.display_en ?? vt;
}

export default function PackagesScreen() {
  const toast = useAdminToast();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] = useState<Package | null>(
    null,
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<PackagesResponse>(
      "/api/admin/packages",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load packages: ${error ?? "unknown"}`, "error");
      }
      setPackages([]);
    } else {
      setPackages(data.packages);
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

  const openEdit = (pkg: Package) => {
    setMode("edit");
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      call_count: pkg.call_count,
      duration_days: pkg.duration_days,
      price_bdt_taka: pkg.price_bdt / 100, // paisa → taka
      daily_cap: pkg.daily_cap,
      is_trial: pkg.is_trial,
      is_active: pkg.is_active,
      vehicle_type: pkg.vehicle_type ?? "",
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const handleSave = async () => {
    const name = String(form.name ?? "").trim();
    if (!name) {
      toast.show("Name is required", "error");
      return;
    }
    const call_count = Number(form.call_count);
    const duration_days = Number(form.duration_days);
    const price_bdt_taka = Number(form.price_bdt_taka);
    const daily_cap = Number(form.daily_cap);

    if (!Number.isFinite(call_count) || call_count <= 0) {
      toast.show("Calls must be a positive integer", "error");
      return;
    }
    if (!Number.isFinite(duration_days) || duration_days <= 0) {
      toast.show("Duration must be a positive integer", "error");
      return;
    }
    if (!Number.isFinite(price_bdt_taka) || price_bdt_taka < 0) {
      toast.show("Price must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(daily_cap) || daily_cap <= 0) {
      toast.show("Daily cap must be a positive integer", "error");
      return;
    }

    const payload = {
      name,
      call_count: Math.floor(call_count),
      duration_days: Math.floor(duration_days),
      price_bdt: Math.round(price_bdt_taka * 100), // taka → paisa
      daily_cap: Math.floor(daily_cap),
      is_trial: Boolean(form.is_trial),
      is_active: Boolean(form.is_active),
      vehicle_type: form.vehicle_type || null, // "" → null (universal)
    };

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<PackageResponse>(
          "/api/admin/packages",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Package created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<PackageResponse>(
          "/api/admin/packages",
          {
            method: "PUT",
            body: JSON.stringify({ id: editingId, ...payload }),
          },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Package updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (pkg: Package) => {
    const next = !pkg.is_active;
    const { error } = await adminFetch<PackageResponse>("/api/admin/packages", {
      method: "PUT",
      body: JSON.stringify({ id: pkg.id, is_active: next }),
    });
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "Package activated" : "Package deactivated", "success");
    await fetchList();
  };

  const openDeactivate = (pkg: Package) => {
    if (!pkg.is_active) {
      toast.show("Package is already inactive", "info");
      return;
    }
    setConfirmDeactivate(pkg);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<PackageResponse>(
        "/api/admin/packages",
        {
          method: "PUT",
          body: JSON.stringify({
            id: confirmDeactivate.id,
            is_active: false,
          }),
        },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Package deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const fields: AdminField[] = [
    {
      name: "name",
      label: "Name",
      type: "text",
      required: true,
      placeholder: "e.g. Starter 100",
    },
    { name: "call_count", label: "Calls", type: "number", required: true },
    {
      name: "duration_days",
      label: "Duration (days)",
      type: "number",
      required: true,
    },
    {
      name: "price_bdt_taka",
      label: "Price (৳ taka)",
      type: "number",
      required: true,
      helpText: "Whole taka. Multiplied by 100 to store as paisa.",
    },
    {
      name: "daily_cap",
      label: "Daily Cap (calls/day)",
      type: "number",
      required: true,
    },
    { name: "is_trial", label: "Trial package", type: "boolean" },
    { name: "is_active", label: "Active", type: "boolean" },
    {
      name: "vehicle_type",
      label: "Vehicle Type",
      type: "select",
      options: VEHICLE_TYPE_OPTIONS,
      helpText: "All Types = available to every vehicle type.",
    },
  ];

  const columns: AdminColumn<Package>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (p) => <Text style={styles.cellPrimary}>{p.name}</Text>,
    },
    { key: "call_count", header: "Calls", sortable: true, width: 90 },
    { key: "duration_days", header: "Days", sortable: true, width: 80 },
    {
      key: "price_bdt",
      header: "Price",
      sortable: true,
      width: 100,
      render: (p) => (
        <Text style={styles.cellText}>৳{(p.price_bdt / 100).toFixed(0)}</Text>
      ),
    },
    {
      key: "is_trial",
      header: "Trial",
      width: 80,
      render: (p) => (
        <Text style={[styles.cellText, p.is_trial && { color: colors.amber }]}>
          {p.is_trial ? "Yes" : "No"}
        </Text>
      ),
    },
    { key: "daily_cap", header: "Daily Cap", width: 100 },
    {
      key: "vehicle_type",
      header: "Vehicle",
      width: 120,
      render: (p) => (
        <Text style={styles.cellText}>{vehicleLabel(p.vehicle_type)}</Text>
      ),
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (p) => (
        <AdminToggle
          value={p.is_active}
          onValueChange={() => handleToggleActive(p)}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 220,
      render: (p) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(p)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[
              styles.miniBtn,
              {
                backgroundColor: colors.danger,
                opacity: p.is_active ? 1 : 0.4,
              },
            ]}
            onPress={() => openDeactivate(p)}
            disabled={!p.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Call Packages"
      subtitle="Subscription tiers drivers can buy"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Package</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={packages}
        rowKey={(p) => p.id}
        loading={loading}
        emptyMessage="No packages yet. Create one to get started."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Package" : "Edit Package"}
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
        title="Deactivate package"
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
          Deactivate this package? Riders can no longer purchase it.
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
