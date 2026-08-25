// Admin CRUD for the event calendar — dispatch/heat-engine input only, NEVER
// fare. See src/db/schema.ts (eventCalendar) and app/api/admin/events+api.ts.
// Pattern mirrors app/admin/promos.tsx.
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
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

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  venue: string | null;
  latitude: string | null;
  longitude: string | null;
  event_start: string;
  event_end: string;
  is_active: boolean;
}

interface EventsResponse {
  events: EventRow[];
  total: number;
  has_more: boolean;
}

type Mode = "create" | "edit";

interface EventForm {
  title: string;
  description: string;
  venue: string;
  latitude: string;
  longitude: string;
  event_start: string | null;
  event_end: string | null;
  is_active: boolean;
}

const EMPTY_FORM: EventForm = {
  title: "",
  description: "",
  venue: "",
  latitude: "",
  longitude: "",
  event_start: null,
  event_end: null,
  is_active: true,
};

export default function EventsScreen() {
  const toast = useAdminToast();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>({ ...EMPTY_FORM });
  const [confirmDeactivate, setConfirmDeactivate] = useState<EventRow | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<EventsResponse>(
      "/api/admin/events?status=all&limit=200",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) toast.show(`Failed to load events: ${error ?? "unknown"}`, "error");
      setEvents([]);
    } else {
      setEvents(data.events ?? []);
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

  const openEdit = (e: EventRow) => {
    setMode("edit");
    setEditingId(e.id);
    setForm({
      title: e.title,
      description: e.description ?? "",
      venue: e.venue ?? "",
      latitude: e.latitude ?? "",
      longitude: e.longitude ?? "",
      event_start: e.event_start,
      event_end: e.event_end,
      is_active: e.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  const buildPayload = (): Record<string, unknown> | null => {
    const title = String(form.title).trim();
    if (!title) {
      toast.show("Title is required", "error");
      return null;
    }
    const start = form.event_start;
    const end = form.event_end;
    if (!start || !end) {
      toast.show("Event start and end are required", "error");
      return null;
    }
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      toast.show("Event end must be after event start", "error");
      return null;
    }
    const lat = form.latitude.trim() ? Number(form.latitude) : null;
    const lng = form.longitude.trim() ? Number(form.longitude) : null;
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      toast.show("Latitude must be between -90 and 90", "error");
      return null;
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      toast.show("Longitude must be between -180 and 180", "error");
      return null;
    }
    return {
      title,
      description: String(form.description).trim() || undefined,
      venue: String(form.venue).trim() || undefined,
      latitude: lat,
      longitude: lng,
      event_start: start,
      event_end: end,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<{ event_id: string }>(
          "/api/admin/events",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Event created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<{ event: EventRow }>(
          `/api/admin/events?id=${encodeURIComponent(editingId)}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Event updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (e: EventRow) => {
    const next = !e.is_active;
    const { error } = await adminFetch(`/api/admin/events?id=${encodeURIComponent(e.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: next }),
    });
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "Event activated" : "Event deactivated", "success");
    await fetchList();
  };

  const openDeactivate = (e: EventRow) => {
    if (!e.is_active) {
      toast.show("Event is already inactive", "info");
      return;
    }
    setConfirmDeactivate(e);
  };

  const confirmDeactivateAction = async () => {
    if (!confirmDeactivate) return;
    setSubmitting(true);
    try {
      const { error } = await adminFetch(
        `/api/admin/events?id=${encodeURIComponent(confirmDeactivate.id)}`,
        { method: "PATCH", body: JSON.stringify({ is_active: false }) },
      );
      if (error) {
        toast.show(`Deactivate failed: ${error}`, "error");
        return;
      }
      toast.show("Event deactivated", "success");
      setConfirmDeactivate(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const searchTerm = search.trim().toLowerCase();
  const filteredEvents = events.filter((e) => {
    if (!searchTerm) return true;
    return (
      e.title.toLowerCase().includes(searchTerm) ||
      (e.venue?.toLowerCase().includes(searchTerm) ?? false)
    );
  });

  const fields: AdminField[] = [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "e.g. Concert at Army Stadium" },
    { name: "description", label: "Description", type: "textarea", placeholder: "Internal notes (optional)" },
    { name: "venue", label: "Venue", type: "text", placeholder: "e.g. Bangabandhu National Stadium" },
    { name: "latitude", label: "Latitude", type: "number", step: 0.000001, helpText: "Optional — feeds the heat/dispatch engine, never fare." },
    { name: "longitude", label: "Longitude", type: "number", step: 0.000001 },
    { name: "event_start", label: "Event Start", type: "datetime", required: true },
    { name: "event_end", label: "Event End", type: "datetime", required: true },
    { name: "is_active", label: "Active", type: "boolean" },
  ];

  const formValues: Record<string, unknown> = { ...form };
  const onChangeForm = (next: Record<string, unknown>) =>
    setForm({ ...EMPTY_FORM, ...(next as Partial<EventForm>) });

  const columns: AdminColumn<EventRow>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      width: 220,
      render: (e) => <Text style={styles.cellPrimary}>{e.title}</Text>,
    },
    {
      key: "venue",
      header: "Venue",
      width: 180,
      render: (e) => <Text style={styles.cellText}>{e.venue ?? "—"}</Text>,
    },
    {
      key: "event_start",
      header: "Starts",
      width: 160,
      sortable: true,
      render: (e) => <Text style={styles.cellText}>{new Date(e.event_start).toLocaleString()}</Text>,
    },
    {
      key: "event_end",
      header: "Ends",
      width: 160,
      sortable: true,
      render: (e) => <Text style={styles.cellText}>{new Date(e.event_end).toLocaleString()}</Text>,
    },
    {
      key: "is_active",
      header: "Active",
      width: 90,
      render: (e) => <AdminToggle value={e.is_active} onValueChange={() => handleToggleActive(e)} />,
    },
    {
      key: "actions",
      header: "Actions",
      width: 170,
      render: (e) => (
        <View style={styles.actionsRow}>
          <Pressable style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]} onPress={() => openEdit(e)}>
            <Text style={styles.miniBtnText}>Edit</Text>
          </Pressable>
          <Pressable
            style={[styles.miniBtn, { backgroundColor: colors.danger, opacity: e.is_active ? 1 : 0.4 }]}
            onPress={() => openDeactivate(e)}
            disabled={!e.is_active}
          >
            <Text style={styles.miniBtnText}>Deactivate</Text>
          </Pressable>
        </View>
      ),
    },
  ];

  return (
    <AdminShell
      title="Events"
      subtitle="Dispatch/heat-engine input — never affects fare"
      actions={
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          <View style={styles.searchWrap}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search title or venue…"
              placeholderTextColor={colors.textDisabledDark}
              style={styles.searchInput}
            />
          </View>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Event</Text>
          </Pressable>
        </View>
      }
    >
      <AdminTable
        columns={columns}
        rows={filteredEvents}
        rowKey={(e) => e.id}
        loading={loading}
        emptyMessage={
          searchTerm ? `No events match "${searchTerm}".` : "No events yet. Create one to get started."
        }
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Event" : "Edit Event"}
        onClose={closeModal}
        width={620}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={closeModal} disabled={submitting}>
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={handleSave} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>{mode === "create" ? "Create" : "Save"}</Text>
              )}
            </Pressable>
          </View>
        }
      >
        <AdminForm fields={fields} values={formValues} onChange={onChangeForm} />
      </AdminModal>

      <AdminModal
        visible={!!confirmDeactivate}
        title="Deactivate event"
        onClose={() => !submitting && setConfirmDeactivate(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable style={[styles.modalBtn, styles.modalBtnGhost]} onPress={() => setConfirmDeactivate(null)} disabled={submitting}>
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.modalBtn, { backgroundColor: colors.danger }]} onPress={confirmDeactivateAction} disabled={submitting}>
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
          {`Deactivate "${confirmDeactivate?.title ?? ""}"? It will stop influencing the heat/dispatch engine.`}
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  cellPrimary: { color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  cellText: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13 },
  searchWrap: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 10,
    minWidth: 200,
  },
  searchInput: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13, paddingVertical: 8, paddingHorizontal: 4 },
  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniBtnText: { color: colors.white, fontFamily: "Jakarta-SemiBold", fontSize: 11 },
  primaryBtn: { backgroundColor: colors.adminAccent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  primaryBtnText: { color: colors.white, fontFamily: "Jakarta-SemiBold", fontSize: 12 },
  ghostBtn: { backgroundColor: colors.darkSecondary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#2A2D35" },
  ghostBtnText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 90, alignItems: "center" },
  modalBtnGhost: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#2A2D35" },
  modalBtnGhostText: { color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  modalBtnPrimary: { backgroundColor: colors.adminAccent },
  modalBtnText: { color: colors.white, fontFamily: "Jakarta-SemiBold", fontSize: 13 },
  confirmText: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 14, lineHeight: 20 },
});
