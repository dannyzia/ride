// F15-UI-10 Vehicle Models Management
// Admin CRUD for the vehicle_models reference table. This catalog powers
// auto-suggest during driver onboarding (brand/model pickers).
//
// Schema: vehicleModels (src/db/schema.ts). default_vehicle_type is a NOT NULL
// enum constrained to the 8 lowercase snake_case values exported from
// @/lib/vehicleTypes. Optional numeric columns (year_start/end, cc_min/max)
// are nullable; empty inputs are converted to null on submit.
//
// Filtering is local (client-side) for snappy UX: we fetch up to 200 rows
// and filter by search text and vehicle type in-memory.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_VALUES,
  type VehicleTypeEnum,
} from "@/lib/vehicleTypes";

interface VehicleModel {
  id: string;
  brand: string;
  model: string;
  year_start: number | null;
  year_end: number | null;
  default_vehicle_type: VehicleTypeEnum;
  typical_cc_min: number | null;
  typical_cc_max: number | null;
  has_ac: boolean | null;
  passenger_seats: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface ModelsResponse {
  models: VehicleModel[];
  total: number;
  has_more: boolean;
}

interface ModelResponse {
  model: VehicleModel;
}

type Mode = "create" | "edit";
type VehicleTypeFilter = VehicleTypeEnum | "all";

const VEHICLE_TYPE_FORM_OPTIONS = VEHICLE_TYPES.map((v) => ({
  label: v.display_en,
  value: v.key,
}));

const EMPTY_FORM: Record<string, unknown> = {
  brand: "",
  model: "",
  year_start: "",
  year_end: "",
  default_vehicle_type: "bike_standard",
  typical_cc_min: "",
  typical_cc_max: "",
  has_ac: false,
  passenger_seats: 4,
  is_active: true,
};

const FETCH_LIMIT = 200;

export default function VehicleModelsScreen() {
  const toast = useAdminToast();
  const [models, setModels] = useState<VehicleModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [mode, setMode] = useState<Mode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ ...EMPTY_FORM });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<VehicleTypeFilter>("all");

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<ModelsResponse>(
      `/api/admin/vehicle-models?limit=${FETCH_LIMIT}`,
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load models: ${error ?? "unknown"}`, "error");
      }
      setModels([]);
    } else {
      setModels(data.models);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return models.filter((m) => {
      if (typeFilter !== "all" && m.default_vehicle_type !== typeFilter) {
        return false;
      }
      if (!q) return true;
      return (
        m.brand.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q)
      );
    });
  }, [models, search, typeFilter]);

  const openCreate = () => {
    setMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setModalVisible(true);
  };

  const openEdit = (m: VehicleModel) => {
    setMode("edit");
    setEditingId(m.id);
    setForm({
      brand: m.brand,
      model: m.model,
      year_start: m.year_start ?? "",
      year_end: m.year_end ?? "",
      default_vehicle_type: m.default_vehicle_type,
      typical_cc_min: m.typical_cc_min ?? "",
      typical_cc_max: m.typical_cc_max ?? "",
      has_ac: m.has_ac ?? false,
      passenger_seats: m.passenger_seats,
      is_active: m.is_active,
    });
    setModalVisible(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalVisible(false);
  };

  // Convert a possibly-empty numeric form value into null|number.
  // Returns null for "" / undefined / NaN.
  const toNullableInt = (raw: unknown): number | null => {
    if (raw === "" || raw === undefined || raw === null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
    return n;
  };

  const buildPayload = () => {
    const brand = String(form.brand ?? "").trim();
    const model = String(form.model ?? "").trim();
    if (!brand) {
      toast.show("Brand is required", "error");
      return null;
    }
    if (!model) {
      toast.show("Model is required", "error");
      return null;
    }
    const defaultVehicleType = form.default_vehicle_type as VehicleTypeEnum;
    if (!VEHICLE_TYPE_VALUES.includes(defaultVehicleType)) {
      toast.show("Default vehicle type must be selected", "error");
      return null;
    }

    const yearStart = toNullableInt(form.year_start);
    const yearEnd = toNullableInt(form.year_end);
    const ccMin = toNullableInt(form.typical_cc_min);
    const ccMax = toNullableInt(form.typical_cc_max);

    if (
      yearStart !== null &&
      (yearStart < 1900 || yearStart > 2100)
    ) {
      toast.show("Year start must be 1900–2100", "error");
      return null;
    }
    if (yearEnd !== null && (yearEnd < 1900 || yearEnd > 2100)) {
      toast.show("Year end must be 1900–2100", "error");
      return null;
    }
    if (yearStart !== null && yearEnd !== null && yearEnd < yearStart) {
      toast.show("Year end cannot be before year start", "error");
      return null;
    }
    if (ccMin !== null && ccMin < 0) {
      toast.show("CC min must be ≥ 0", "error");
      return null;
    }
    if (ccMax !== null && ccMax < 0) {
      toast.show("CC max must be ≥ 0", "error");
      return null;
    }
    if (ccMin !== null && ccMax !== null && ccMax < ccMin) {
      toast.show("CC max cannot be below CC min", "error");
      return null;
    }

    const seats = toNullableInt(form.passenger_seats);
    if (seats === null || seats < 1 || seats > 20) {
      toast.show("Seats must be an integer 1–20", "error");
      return null;
    }

    return {
      brand,
      model,
      year_start: yearStart,
      year_end: yearEnd,
      default_vehicle_type: defaultVehicleType,
      typical_cc_min: ccMin,
      typical_cc_max: ccMax,
      has_ac: Boolean(form.has_ac),
      passenger_seats: seats,
      is_active: Boolean(form.is_active),
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;

    setSubmitting(true);
    try {
      if (mode === "create") {
        const { data, error } = await adminFetch<ModelResponse>(
          "/api/admin/vehicle-models",
          { method: "POST", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Create failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Model created", "success");
      } else if (editingId) {
        const { data, error } = await adminFetch<ModelResponse>(
          `/api/admin/vehicle-model/${editingId}`,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        if (error || !data) {
          toast.show(`Update failed: ${error ?? "unknown"}`, "error");
          return;
        }
        toast.show("Model updated", "success");
      }
      setModalVisible(false);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (m: VehicleModel) => {
    const next = !m.is_active;
    const { error } = await adminFetch<ModelResponse>(
      `/api/admin/vehicle-model/${m.id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: next }),
      },
    );
    if (error) {
      toast.show(`Toggle failed: ${error}`, "error");
      return;
    }
    toast.show(next ? "Model activated" : "Model deactivated", "success");
    await fetchList();
  };

  const fields: AdminField[] = [
    {
      name: "brand",
      label: "Brand",
      type: "text",
      required: true,
      placeholder: "e.g. Yamaha",
    },
    {
      name: "model",
      label: "Model",
      type: "text",
      required: true,
      placeholder: "e.g. FZ-S V3",
    },
    {
      name: "year_start",
      label: "Year Start (blank = any)",
      type: "number",
    },
    {
      name: "year_end",
      label: "Year End (blank = open)",
      type: "number",
    },
    {
      name: "default_vehicle_type",
      label: "Default Vehicle Type",
      type: "select",
      required: true,
      options: VEHICLE_TYPE_FORM_OPTIONS,
    },
    {
      name: "typical_cc_min",
      label: "Typical CC Min (blank = n/a)",
      type: "number",
    },
    {
      name: "typical_cc_max",
      label: "Typical CC Max (blank = n/a)",
      type: "number",
    },
    {
      name: "passenger_seats",
      label: "Passenger Seats",
      type: "number",
      required: true,
    },
    {
      name: "has_ac",
      label: "Has AC",
      type: "boolean",
      helpText:
        "Bikes/CNG typically leave this off. Stored as a boolean; null defaults to false here.",
    },
    {
      name: "is_active",
      label: "Active",
      type: "boolean",
    },
  ];

  const columns: AdminColumn<VehicleModel>[] = [
    {
      key: "brand",
      header: "Brand",
      sortable: true,
      render: (m) => <Text style={styles.cellPrimary}>{m.brand}</Text>,
    },
    {
      key: "model",
      header: "Model",
      sortable: true,
      render: (m) => <Text style={styles.cellPrimary}>{m.model}</Text>,
    },
    {
      key: "year_range",
      header: "Year Range",
      width: 120,
      render: (m) => {
        const s = m.year_start;
        const e = m.year_end;
        let label: string;
        if (s == null && e == null) label = "—";
        else if (s == null) label = `—${e}`;
        else if (e == null) label = `${s}–`;
        else label = `${s}–${e}`;
        return <Text style={styles.cellText}>{label}</Text>;
      },
    },
    {
      key: "default_vehicle_type",
      header: "Default Type",
      sortable: true,
      width: 140,
      render: (m) => {
        const def = VEHICLE_TYPES.find((v) => v.key === m.default_vehicle_type);
        return (
          <Text style={styles.cellText}>
            {def ? def.display_en : m.default_vehicle_type}
          </Text>
        );
      },
    },
    {
      key: "cc_range",
      header: "CC Range",
      width: 110,
      render: (m) => {
        const lo = m.typical_cc_min;
        const hi = m.typical_cc_max;
        let label: string;
        if (lo == null && hi == null) label = "—";
        else if (lo == null) label = `—${hi}`;
        else if (hi == null) label = `${lo}–`;
        else label = `${lo}–${hi}`;
        return <Text style={styles.cellText}>{label}</Text>;
      },
    },
    {
      key: "passenger_seats",
      header: "Seats",
      sortable: true,
      width: 80,
    },
    {
      key: "has_ac",
      header: "AC",
      width: 70,
      render: (m) => (
        <Text style={styles.cellText}>
          {m.has_ac == null ? "—" : m.has_ac ? "Yes" : "No"}
        </Text>
      ),
    },
    {
      key: "is_active",
      header: "Active",
      width: 100,
      render: (m) => (
        <AdminToggle
          value={m.is_active}
          onValueChange={() => handleToggleActive(m)}
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 110,
      render: (m) => (
        <Pressable
          style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
          onPress={() => openEdit(m)}
        >
          <Text style={styles.miniBtnText}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  // Build the type filter chips: "All" + one per vehicle type.
  const typeFilterOptions: { label: string; value: VehicleTypeFilter }[] = [
    { label: "All", value: "all" },
    ...VEHICLE_TYPES.map((v) => ({
      label: v.display_en,
      value: v.key as VehicleTypeFilter,
    })),
  ];

  return (
    <AdminShell
      title="Vehicle Models"
      subtitle="Reference DB for driver onboarding auto-suggest"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable style={styles.ghostBtn} onPress={fetchList}>
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={openCreate}>
            <Text style={styles.primaryBtnText}>+ New Model</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search brand or model…"
            placeholderTextColor={colors.textDisabledDark}
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={styles.filterChipRow}>
          {typeFilterOptions.map((opt) => {
            const selected = typeFilter === opt.value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => setTypeFilter(opt.value)}
                style={[
                  styles.filterChip,
                  selected && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selected && styles.filterChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <AdminTable
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        loading={loading}
        emptyMessage={
          search || typeFilter !== "all"
            ? "No models match the current filters."
            : "No vehicle models yet. Create one to get started."
        }
        pagination={null}
      />

      <AdminModal
        visible={modalVisible}
        title={mode === "create" ? "New Vehicle Model" : "Edit Vehicle Model"}
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
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    marginBottom: 14,
    gap: 10,
  },
  searchWrap: {
    backgroundColor: colors.darkSecondary,
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    maxWidth: 360,
  },
  searchInput: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    paddingVertical: 10,
  },
  filterChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterChip: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: colors.adminAccent,
    borderColor: colors.adminAccent,
  },
  filterChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  filterChipTextActive: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
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
});
