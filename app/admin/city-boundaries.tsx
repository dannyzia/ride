// F15-UI-04 City Boundaries
// CRUD for intercity geo-fencing polygons. Polygon stored as JSON array of
// {lat, lng} points.
//
// API contract notes (differs from zones!):
//  - GET supports ?include_inactive=true to list soft-deleted rows too.
//  - POST returns { city_boundary_id } (not the full row). We refetch after.
//  - Update is PATCH with ?id=<uuid> (not PUT, not body.id).
//  - DELETE soft-deletes via is_active:false (not a hard delete).
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

interface LatLng {
  lat: number;
  lng: number;
}

interface CityBoundary {
  id: string;
  name: string;
  polygon: LatLng[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CitiesResponse {
  cities: CityBoundary[];
}

interface CreateResponse {
  city_boundary_id: string;
}

interface PatchResponse {
  city_boundary_id: string;
  updated?: true;
  is_active?: boolean;
}

type Mode = "create" | "edit";

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  is_active: true,
  polygon_json:
    '[{"lat":23.8,"lng":90.4},{"lat":23.9,"lng":90.4},{"lat":23.9,"lng":90.5},{"lat":23.8,"lng":90.5}]',
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function parsePolygon(
  raw: string,
  toast: ReturnType<typeof useAdminToast>,
): LatLng[] | null {
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    toast.show("Polygon is not valid JSON", "error");
    return null;
  }
  if (!Array.isArray(arr) || arr.length < 3) {
    toast.show(
      "Polygon must be an array of at least 3 {lat,lng} points",
      "error",
    );
    return null;
  }
  for (const p of arr) {
    if (
      typeof p !== "object" ||
      p === null ||
      typeof (p as LatLng).lat !== "number" ||
      typeof (p as LatLng).lng !== "number"
    ) {
      toast.show(
        "Each polygon point must be {lat:number, lng:number}",
        "error",
      );
      return null;
    }
  }
  return arr as LatLng[];
}

export default function CityBoundariesScreen() {
  const toast = useAdminToast();
  const [cities, setCities] = useState<CityBoundary[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDelete, setConfirmDelete] = useState<CityBoundary | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<CitiesResponse>(
      "/api/admin/city-boundaries?include_inactive=true",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load cities: ${error ?? "unknown"}`, "error");
      }
      setCities([]);
    } else {
      setCities(data.cities);
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

  const openEdit = (city: CityBoundary) => {
    setMode("edit");
    setEditingId(city.id);
    setForm({
      name: city.name,
      is_active: city.is_active,
      polygon_json: JSON.stringify(city.polygon, null, 2),
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const handleSave = async () => {
    const name = String(form.name ?? "").trim();
    if (name.length < 2) {
      toast.show("Name must be at least 2 characters", "error");
      return;
    }
    const polygon = parsePolygon(String(form.polygon_json ?? ""), toast);
    if (!polygon) return;

    const payload = {
      name,
      is_active: Boolean(form.is_active),
      polygon,
    };

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<CreateResponse>(
          "/api/admin/city-boundaries",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("City boundary created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<PatchResponse>(
          `/api/admin/city-boundaries?id=${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("City boundary updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (city: CityBoundary) => {
    const next = !city.is_active;
    const { error } = await adminFetch<PatchResponse>(
      `/api/admin/city-boundaries?id=${encodeURIComponent(city.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "City activated" : "City deactivated", "success");
    await fetchList();
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<PatchResponse>(
        `/api/admin/city-boundaries?id=${encodeURIComponent(confirmDelete.id)}`,
        { method: "DELETE" },
      );
      if (error) {
        toast.show(`Delete failed: ${error}`, "error");
        return;
      }
      toast.show("City deactivated", "success");
      setConfirmDelete(null);
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
      placeholder: "e.g. Dhaka",
    },
    { name: "is_active", label: "Active", type: "boolean" },
    {
      name: "polygon_json",
      label: "Polygon (JSON)",
      type: "textarea",
      required: true,
      placeholder: '[{"lat":23.8,"lng":90.4}, ...]',
      helpText:
        'JSON array of at least 3 points, each {"lat":number,"lng":number}.',
    },
  ];

  const columns: AdminColumn<CityBoundary>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (c) => <Text style={styles.cellPrimary}>{c.name}</Text>,
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (c) => (
        <AdminToggle
          value={c.is_active}
          onValueChange={() => handleToggleActive(c)}
        />
      ),
    },
    {
      key: "polygon",
      header: "Polygon Points",
      width: 140,
      render: (c) => (
        <Text style={styles.cellText}>{c.polygon.length} pts</Text>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      width: 220,
      render: (c) => (
        <Text style={styles.cellText}>{formatDateTime(c.created_at)}</Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 180,
      render: (c) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(c)}
           testID="admin.city-boundaries.open-edit">
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.danger }]}
            onPress={() => setConfirmDelete(c)}
           testID="admin.city-boundaries.set-confirm-delete">
            <Text style={styles.miniBtnText}>Delete</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="City Boundaries"
      subtitle="Intercity geo-fencing polygons"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList} testID="admin.city-boundaries.fetch-list">
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate} testID="admin.city-boundaries.open-create">
            <Text style={styles.primaryBtnText}>+ New Boundary</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={cities}
        rowKey={(c) => c.id}
        loading={loading}
        emptyMessage="No city boundaries yet."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New City Boundary" : "Edit City Boundary"}
        onClose={closeModal}
        width={620}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={closeModal}
              disabled={submitting}
             testID="admin.city-boundaries.close-modal">
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnPrimary]}
              onPress={handleSave}
              disabled={submitting}
             testID="admin.city-boundaries.handle-save">
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
        title="Delete city boundary"
        onClose={() => !submitting && setConfirmDelete(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmDelete(null)}
              disabled={submitting}
             testID="admin.city-boundaries.set-confirm-delete-2">
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: colors.danger }]}
              onPress={confirmDeleteAction}
              disabled={submitting}
             testID="admin.city-boundaries.confirm-delete-action">
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
          Delete city boundary “{confirmDelete?.name}”? This deactivates the
          boundary (soft-delete). Existing rides are unaffected.
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
