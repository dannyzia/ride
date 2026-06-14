// F15-UI-03 Zones (simplified)
// CRUD for dispatch service areas. Polygon stored as a JSON array of
// {lat, lng} points. NOTE: the zones API applies exclusive activation —
// setting is_active=true on one zone deactivates all others.
//
// API quirk: PUT /api/admin/zones requires `polygon` to be present in the
// body (it branches on `body.id && body.polygon`). Even when only toggling
// is_active we re-send the existing polygon to satisfy this contract.
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

interface Zone {
  id: string;
  name: string;
  polygon: LatLng[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // GET includes nested `pricing` rows; not used on this screen.
  pricing?: unknown[];
}

interface ZonesResponse {
  zones: Zone[];
}

interface ZoneResponse {
  zone: Zone;
}

interface DeleteResponse {
  success: true;
}

type Mode = "create" | "edit";

const EMPTY_FORM: Record<string, unknown> = {
  name: "",
  is_active: false,
  polygon_json:
    '[{"lat":23.8,"lng":90.4},{"lat":23.9,"lng":90.4},{"lat":23.9,"lng":90.5}]',
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

export default function ZonesScreen() {
  const toast = useAdminToast();
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [confirmDelete, setConfirmDelete] = useState<Zone | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<ZonesResponse>(
      "/api/admin/zones",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load zones: ${error ?? "unknown"}`, "error");
      }
      setZones([]);
    } else {
      setZones(data.zones);
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

  const openEdit = (zone: Zone) => {
    setMode("edit");
    setEditingId(zone.id);
    setForm({
      name: zone.name,
      is_active: zone.is_active,
      polygon_json: JSON.stringify(zone.polygon, null, 2),
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
        const { data, error } = await adminFetch<ZoneResponse>(
          "/api/admin/zones",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Zone created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<ZoneResponse>(
          "/api/admin/zones",
          {
            method: "PUT",
            body: JSON.stringify({ id: editingId, ...payload }),
          },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Zone updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (zone: Zone) => {
    const next = !zone.is_active;
    // API requires polygon in the PUT body even when only toggling is_active.
    const { error } = await adminFetch<ZoneResponse>("/api/admin/zones", {
      method: "PUT",
      body: JSON.stringify({
        id: zone.id,
        name: zone.name,
        polygon: zone.polygon,
        is_active: next,
      }),
    });
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(
      next ? "Zone activated (other zones deactivated)" : "Zone deactivated",
      "success",
    );
    await fetchList();
  };

  const confirmDeleteAction = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch<DeleteResponse>(
        `/api/admin/zones?id=${encodeURIComponent(confirmDelete.id)}`,
        { method: "DELETE" },
      );
      if (error) {
        toast.show(`Delete failed: ${error}`, "error");
        return;
      }
      toast.show("Zone deleted", "success");
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
      placeholder: "e.g. Dhaka Metro",
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

  const columns: AdminColumn<Zone>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (z) => <Text style={styles.cellPrimary}>{z.name}</Text>,
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (z) => (
        <AdminToggle
          value={z.is_active}
          onValueChange={() => handleToggleActive(z)}
        />
      ),
    },
    {
      key: "polygon",
      header: "Polygon Points",
      width: 140,
      render: (z) => (
        <Text style={styles.cellText}>{z.polygon.length} pts</Text>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      width: 220,
      render: (z) => (
        <Text style={styles.cellText}>{formatDateTime(z.created_at)}</Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 180,
      render: (z) => (
        <View style={styles.actionsRow}>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
            onPress={() => openEdit(z)}
          >
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.danger }]}
            onPress={() => setConfirmDelete(z)}
          >
            <Text style={styles.miniBtnText}>Delete</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Operational Zones"
      subtitle="Service areas where dispatch operates"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Zone</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={zones}
        rowKey={(z) => z.id}
        loading={loading}
        emptyMessage="No zones yet. Create one to scope dispatch."
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Zone" : "Edit Zone"}
        onClose={closeModal}
        width={620}
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
        title="Delete zone"
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
          Delete zone “{confirmDelete?.name}”? This soft-deletes the zone and
          deactivates its pricing rows.
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
