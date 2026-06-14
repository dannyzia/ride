// F15-UI-03 Pricing Tiers
// Admin editor for per-vehicle / per-zone pricing rows. Money values are
// integer paisa in the DB and API; this screen displays them in taka and
// multiplies ×100 on save.
//
// API contract notes:
//  - Only GET and PATCH are implemented on /api/admin/pricing.
//  - PATCH body carries `id` plus any subset of the updatable fields.
//  - vehicle_type and zone_id are NOT in the PATCH schema, so they are
//    shown read-only in the modal.
//  - `floor_min` is MINUTES (not paisa). `floor_length_km` is decimal km.
//    Both feed the floor-fare formula in lib/fareCalc.ts.
//  - `per_min_bdt` is per-minute (not per-2-min).
//  - `platform_commission_percent` is a 0–100 percentage, not paisa.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";
import {
  VEHICLE_TYPES,
  type VehicleTypeEnum,
} from "@/lib/vehicleTypes";

interface PricingRow {
  id: string;
  zone_id: string;
  vehicle_type: VehicleTypeEnum;
  base_fare_bdt: number; // paisa
  per_km_bdt: number; // paisa
  per_min_bdt: number; // paisa
  floor_length_km: string | number; // km, numeric(10,2)
  floor_min: number; // minutes
  platform_commission_percent: string | number | null; // 0–100
  brta_fare_ceiling_bdt: number | null; // paisa, nullable
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface PricingResponse {
  pricing: PricingRow[];
}

interface PricingPatchResponse {
  pricing: PricingRow;
}

interface Zone {
  id: string;
  name: string;
}

interface ZonesResponse {
  zones: Zone[];
}

function paisaToTaka(paisa: number | null | undefined): string {
  if (paisa === null || paisa === undefined) return "—";
  return `৳${(paisa / 100).toFixed(2)}`;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return 0;
}

function vehicleLabel(key: VehicleTypeEnum): string {
  return VEHICLE_TYPES.find((v) => v.key === key)?.display_en ?? key;
}

export default function PricingScreen() {
  const toast = useAdminToast();
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [zoneMap, setZoneMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<PricingRow | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    // Parallel: pricing rows + zones (for zone_id → name lookup).
    const [pricingRes, zonesRes] = await Promise.all([
      adminFetch<PricingResponse>("/api/admin/pricing", { method: "GET" }),
      adminFetch<ZonesResponse>("/api/admin/zones", { method: "GET" }),
    ]);
    if (pricingRes.error || !pricingRes.data) {
      if (pricingRes.status !== 0) {
        toast.show(
          `Failed to load pricing: ${pricingRes.error ?? "unknown"}`,
          "error",
        );
      }
      setRows([]);
    } else {
      setRows(pricingRes.data.pricing);
    }
    if (zonesRes.data) {
      const map: Record<string, string> = {};
      for (const z of zonesRes.data.zones) map[z.id] = z.name;
      setZoneMap(map);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openEdit = (row: PricingRow) => {
    setEditing(row);
    // Convert paisa → taka for monetary fields on load.
    setForm({
      base_fare_taka: toNumber(row.base_fare_bdt) / 100,
      per_km_taka: toNumber(row.per_km_bdt) / 100,
      per_min_taka: toNumber(row.per_min_bdt) / 100,
      floor_length_km: toNumber(row.floor_length_km),
      floor_min: toNumber(row.floor_min),
      platform_commission_percent:
        row.platform_commission_percent === null
          ? 0
          : toNumber(row.platform_commission_percent),
      brta_fare_ceiling_taka:
        row.brta_fare_ceiling_bdt === null
          ? 0
          : toNumber(row.brta_fare_ceiling_bdt) / 100,
      is_active: row.is_active,
    });
  };

  const closeModal = () => {
    if (submitting) return;
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing) return;

    const base_fare_taka = Number(form.base_fare_taka);
    const per_km_taka = Number(form.per_km_taka);
    const per_min_taka = Number(form.per_min_taka);
    const floor_length_km = Number(form.floor_length_km);
    const floor_min = Number(form.floor_min);
    const commission = Number(form.platform_commission_percent);
    const ceiling_taka = Number(form.brta_fare_ceiling_taka);

    if (!Number.isFinite(base_fare_taka) || base_fare_taka < 0) {
      toast.show("Base fare must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(per_km_taka) || per_km_taka < 0) {
      toast.show("Per KM must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(per_min_taka) || per_min_taka < 0) {
      toast.show("Per Min must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(floor_length_km) || floor_length_km < 0) {
      toast.show("Floor KM must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(floor_min) || floor_min < 0) {
      toast.show("Floor Min must be ≥ 0", "error");
      return;
    }
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
      toast.show("Commission must be 0–100", "error");
      return;
    }

    const hadCeiling = editing.brta_fare_ceiling_bdt !== null;
    const clearingCeiling = hadCeiling && ceiling_taka === 0;
    if (!clearingCeiling && (ceiling_taka < 0 || !Number.isFinite(ceiling_taka))) {
      toast.show("BRTA ceiling must be ≥ 0 (or 0 to clear)", "error");
      return;
    }

    const payload: Record<string, unknown> = {
      id: editing.id,
      base_fare_bdt: Math.round(base_fare_taka * 100),
      per_km_bdt: Math.round(per_km_taka * 100),
      per_min_bdt: Math.round(per_min_taka * 100),
      floor_length_km,
      floor_min: Math.floor(floor_min),
      platform_commission_percent: commission,
      is_active: Boolean(form.is_active),
    };
    // Send ceiling as null when admin clears it (0 in taka → null).
    payload.brta_fare_ceiling_bdt = clearingCeiling
      ? null
      : Math.round(ceiling_taka * 100);

    setSubmitting(true);
    try {
      const { data, error } = await adminFetch<PricingPatchResponse>(
        "/api/admin/pricing",
        { method: "PATCH", body: JSON.stringify(payload) },
      );
      if (error || !data) {
        toast.show(`Update failed: ${error ?? "unknown"}`, "error");
        return;
      }
      toast.show("Pricing updated", "success");
      setEditing(null);
      await fetchList();
    } finally {
      setSubmitting(false);
    }
  };

  const fields: AdminField[] = useMemo(
    () => [
      {
        name: "base_fare_taka",
        label: "Base Fare (৳ taka)",
        type: "number",
        required: true,
        step: 0.5,
      },
      {
        name: "per_km_taka",
        label: "Per KM (৳ taka)",
        type: "number",
        required: true,
        step: 0.1,
      },
      {
        name: "per_min_taka",
        label: "Per Min (৳ taka)",
        type: "number",
        required: true,
        step: 0.1,
      },
      {
        name: "floor_length_km",
        label: "Floor Length (km)",
        type: "number",
        required: true,
        step: 0.5,
        helpText: "Minimum chargeable distance used by the floor-fare formula.",
      },
      {
        name: "floor_min",
        label: "Floor Min (minutes)",
        type: "number",
        required: true,
        helpText: "Minimum chargeable minutes used by the floor-fare formula.",
      },
      {
        name: "platform_commission_percent",
        label: "Commission (%)",
        type: "number",
        required: true,
        helpText: "0–100. Applied to total fare to compute platform fee.",
      },
      {
        name: "brta_fare_ceiling_taka",
        label: "BRTA Ceiling (৳ taka, 0 to clear)",
        type: "number",
        step: 1,
        helpText: "Optional hard cap. Enter 0 to remove an existing ceiling.",
      },
      { name: "is_active", label: "Active", type: "boolean" },
    ],
    [],
  );

  const columns: AdminColumn<PricingRow>[] = [
    {
      key: "vehicle_type",
      header: "Vehicle Type",
      sortable: true,
      render: (r) => (
        <Text style={styles.cellPrimary}>
          {vehicleLabel(r.vehicle_type)}
        </Text>
      ),
    },
    {
      key: "zone_id",
      header: "Zone",
      sortable: true,
      render: (r) => (
        <Text style={styles.cellText}>{zoneMap[r.zone_id] ?? r.zone_id}</Text>
      ),
    },
    {
      key: "base_fare_bdt",
      header: "Base Fare",
      width: 110,
      render: (r) => (
        <Text style={styles.cellText}>{paisaToTaka(r.base_fare_bdt)}</Text>
      ),
    },
    {
      key: "per_km_bdt",
      header: "Per KM",
      width: 100,
      render: (r) => (
        <Text style={styles.cellText}>{paisaToTaka(r.per_km_bdt)}</Text>
      ),
    },
    {
      key: "per_min_bdt",
      header: "Per Min",
      width: 100,
      render: (r) => (
        <Text style={styles.cellText}>{paisaToTaka(r.per_min_bdt)}</Text>
      ),
    },
    {
      key: "platform_commission_percent",
      header: "Commission",
      width: 110,
      render: (r) => (
        <Text style={styles.cellText}>
          {r.platform_commission_percent === null
            ? "—"
            : `${toNumber(r.platform_commission_percent)}%`}
        </Text>
      ),
    },
    {
      key: "floor_length_km",
      header: "Floor KM",
      width: 90,
      render: (r) => (
        <Text style={styles.cellText}>{toNumber(r.floor_length_km)} km</Text>
      ),
    },
    {
      key: "floor_min",
      header: "Floor Min",
      width: 90,
      render: (r) => (
        <Text style={styles.cellText}>{r.floor_min} min</Text>
      ),
    },
    {
      key: "brta_fare_ceiling_bdt",
      header: "BRTA Ceiling",
      width: 120,
      render: (r) => (
        <Text style={styles.cellText}>
          {paisaToTaka(r.brta_fare_ceiling_bdt ?? null)}
        </Text>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      width: 100,
      render: (r) => (
        <Pressable
          style={[styles.miniBtn, { backgroundColor: colors.adminAccent }]}
          onPress={() => openEdit(r)}
        >
          <Text style={styles.miniBtnText}>Edit</Text>
        </Pressable>
      ),
    },
  ];

  return (
    <AdminShell
      title="Pricing Tiers"
      subtitle="Per-vehicle base fare, distance rate, and waiting rate"
      actions={
        <Pressable style={styles.ghostBtn} onPress={fetchList}>
          <Text style={styles.ghostBtnText}>Refresh</Text>
        </Pressable>
      }
    >
      <AdminTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No pricing rows yet."
        pagination={null}
      />

      <AdminModal
        visible={!!editing}
        title={
          editing
            ? `Edit ${vehicleLabel(editing.vehicle_type)} · ${
                zoneMap[editing.zone_id] ?? editing.zone_id
              }`
            : "Edit Pricing"
        }
        onClose={closeModal}
        width={560}
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
                <Text style={styles.modalBtnText}>Save</Text>
              )}
            </Pressable>
          </View>
        }
      >
        {editing ? (
          <View style={{ gap: 14 }}>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Vehicle Type</Text>
              <Text style={styles.readOnlyValue}>
                {vehicleLabel(editing.vehicle_type)}
              </Text>
            </View>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>Zone</Text>
              <Text style={styles.readOnlyValue}>
                {zoneMap[editing.zone_id] ?? editing.zone_id}
              </Text>
            </View>
            <Text style={styles.helpText}>
              Vehicle type and zone are not editable — create a new pricing row
              via the zones screen to change them.
            </Text>
            <AdminForm fields={fields} values={form} onChange={setForm} />
          </View>
        ) : null}
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
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  miniBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
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
  readOnlyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  readOnlyLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  readOnlyValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  helpText: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
});
