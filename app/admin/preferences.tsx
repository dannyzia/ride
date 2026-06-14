// F15-UI-07 Ride Preferences Management
// Admin CRUD for optional rider add-ons (e.g. "Quiet ride", "Extra stop",
// "Pet friendly"). Each preference carries an optional surcharge (paisa in DB,
// edited in taka on this screen) and a flag indicating whether it influences
// dispatch matching.
//
// Schema: preferences (src/db/schema.ts L939). charge_bdt is integer paisa.
// API:    app/api/admin/preferences+api.ts (POST/PATCH/DELETE). GET is targeted
// at the natural REST path; if absent, the list shows empty with a toast.
// Note: the API's DELETE handler currently soft-deactivates (sets is_active=
// false) rather than hard-deleting, which matches this screen's "Delete" UX.
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

interface Preference {
  id: string;
  name: string;
  display_label_en: string;
  display_label_bn: string;
  icon: string | null;
  charge_bdt: number;
  affects_matching: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface PreferencesResponse {
  preferences?: Preference[];
}

interface PreferenceResponse {
  preference?: Preference;
  preference_id?: string;
}

type Mode = "create" | "edit";

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  display_label_en: "",
  display_label_bn: "",
  icon: "",
  // Edited in taka; ×100 to paisa on save.
  surcharge_taka: 0,
  affects_matching: false,
  is_active: true,
};

export default function PreferencesScreen() {
  const toast = useAdminToast();
  const [preferences, setPreferences] = useState<Preference[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDelete, setConfirmDelete] = useState<Preference | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<PreferencesResponse>(
      "/api/admin/preferences",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(
          `Failed to load preferences: ${error ?? "unknown"}`,
          "error",
        );
      }
      setPreferences([]);
    } else {
      setPreferences(data.preferences ?? []);
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

  const openEdit = (p: Preference) => {
    setMode("edit");
    setEditingId(p.id);
    setForm({
      name: p.name,
      display_label_en: p.display_label_en,
      display_label_bn: p.display_label_bn,
      icon: p.icon ?? "",
      surcharge_taka: p.charge_bdt / 100,
      affects_matching: p.affects_matching,
      is_active: p.is_active,
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
      toast.show("Key is required", "error");
      return null;
    }
    // Convention: keys are lowercase snake_case machine names.
    if (!/^[a-z0-9_]+$/.test(name)) {
      toast.show(
        "Key must be lowercase letters, digits, and underscores only",
        "error",
      );
      return null;
    }
    const labelEn = String(form.display_label_en ?? "").trim();
    if (!labelEn) {
      toast.show("English label is required", "error");
      return null;
    }
    const labelBn = String(form.display_label_bn ?? "").trim();
    if (!labelBn) {
      toast.show("Bengali label is required", "error");
      return null;
    }
    const surchargeTaka = Number(form.surcharge_taka);
    if (!Number.isFinite(surchargeTaka) || surchargeTaka < 0) {
      toast.show("Surcharge must be a non-negative number", "error");
      return null;
    }
    const surchargePaisa = Math.round(surchargeTaka * 100);
    if (!Number.isInteger(surchargePaisa) || surchargePaisa < 0) {
      toast.show("Surcharge must resolve to a whole paisa amount", "error");
      return null;
    }
    const icon = String(form.icon ?? "").trim() || null;
    return {
      name,
      display_label_en: labelEn,
      display_label_bn: labelBn,
      icon,
      charge_bdt: surchargePaisa,
      affects_matching: Boolean(form.affects_matching),
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<PreferenceResponse>(
          "/api/admin/preferences",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Preference created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<PreferenceResponse>(
          `/api/admin/preferences?id=${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Preference updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (p: Preference) => {
    const next = !p.is_active;
    const { error } = await adminFetch<PreferenceResponse>(
      `/api/admin/preferences?id=${encodeURIComponent(p.id)}`,
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
      next ? "Preference activated" : "Preference deactivated",
      "success",
    );
    await fetchList();
  };

  const openDelete = (p: Preference) => {
    setConfirmDelete(p);
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<PreferenceResponse>(
        `/api/admin/preferences?id=${encodeURIComponent(confirmDelete.id)}`,
        { method: "DELETE" },
      );
      if (error) {
        toast.show(`Delete failed: ${error}`, "error");
        return;
      }
      toast.show("Preference removed", "success");
      setConfirmDelete(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const fields: AdminField[] = [
    {
      name: "name",
      label: "Key (machine name)",
      type: "text",
      required: true,
      placeholder: "e.g. quiet_ride",
      helpText:
        "Lowercase snake_case. Used internally and stored on ride records.",
    },
    {
      name: "display_label_en",
      label: "English Label",
      type: "text",
      required: true,
      placeholder: "e.g. Quiet ride",
    },
    {
      name: "display_label_bn",
      label: "Bengali Label",
      type: "text",
      required: true,
      placeholder: "বাংলা লেবেল",
    },
    {
      name: "icon",
      label: "Icon Name (optional)",
      type: "text",
      placeholder: "MaterialCommunityIcons glyph name",
      helpText: "Optional icon identifier rendered by the rider app.",
    },
    {
      name: "surcharge_taka",
      label: "Surcharge (৳)",
      type: "number",
      step: 1,
      helpText:
        "Added to fare when rider selects this preference. ×100 to paisa on save.",
    },
    {
      name: "affects_matching",
      label: "Affects Matching",
      type: "boolean",
      helpText:
        "When on, the dispatch engine filters eligible drivers by this preference.",
    },
    { name: "is_active", label: "Active", type: "boolean" },
  ];

  const columns: AdminColumn<Preference>[] = [
    {
      key: "name",
      header: "Key",
      sortable: true,
      width: 160,
      render: (p) => <Text style={styles.cellPrimary}>{p.name}</Text>,
    },
    {
      key: "display_label_en",
      header: "English Label",
      width: 200,
      render: (p) => <Text style={styles.cellText}>{p.display_label_en}</Text>,
    },
    {
      key: "display_label_bn",
      header: "Bengali Label",
      width: 200,
      render: (p) => <Text style={styles.cellText}>{p.display_label_bn}</Text>,
    },
    {
      key: "charge_bdt",
      header: "Surcharge",
      width: 120,
      sortable: true,
      render: (p) => (
        <Text style={styles.cellText}>
          {p.charge_bdt ? `৳${(p.charge_bdt / 100).toFixed(0)}` : "—"}
        </Text>
      ),
    },
    {
      key: "affects_matching",
      header: "Affects Matching",
      width: 150,
      render: (p) => (
        <Text
          style={[
            styles.cellText,
            p.affects_matching ? styles.cellYes : styles.cellMuted,
          ]}
        >
          {p.affects_matching ? "Yes" : "No"}
        </Text>
      ),
    },
    {
      key: "is_active",
      header: "Active",
      width: 90,
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
            style={[styles.miniBtn, { backgroundColor: colors.danger }]}
            onPress={() => openDelete(p)}
          >
            <Text style={styles.miniBtnText}>Delete</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Ride Preferences"
      subtitle="Optional add-ons riders can request"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Preference</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={preferences}
        rowKey={(p) => p.id}
        loading={loading}
        emptyMessage="No preferences yet. Create one to get started."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Preference" : "Edit Preference"}
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
        visible={!!confirmDelete}
        title="Delete preference"
        onClose={() => !submitting && setConfirmDelete(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmDelete(null)}
              disabled={submitting}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.danger }]}
              onPress={confirmDeleteAction}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>Delete</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.confirmText}>
          {`Delete "${confirmDelete?.display_label_en ?? confirmDelete?.name ?? ""}"? This removes the preference from the rider picker. (API soft-deactivates — existing ride records referencing it are unaffected.)`}
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
  cellYes: {
    color: colors.primary,
    fontFamily: "Jakarta-SemiBold",
  },
  cellMuted: {
    color: colors.textSecondaryDark,
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
