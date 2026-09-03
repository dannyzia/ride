/**
 * Admin Marketplace Service Zones — fleet picker + cell list + bulk-add textarea + delete.
 * Route: /admin/marketplace/service-zones
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert, TextInput } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ServiceZone {
  id: string;
  fleet_id: string;
  h3_cell: string;
  resolution: number;
  is_active: boolean;
  created_at: string;
}

interface FleetOption {
  id: string;
  name: string;
}

export default function MarketplaceServiceZones() {
  const [zones, setZones] = useState<ServiceZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFleetId, setSelectedFleetId] = useState<string>("");
  const [fleetSearch, setFleetSearch] = useState("");
  const [fleetOptions, setFleetOptions] = useState<FleetOption[]>([]);
  const [bulkInput, setBulkInput] = useState("");
  const [inserting, setInserting] = useState(false);

  const fetchZones = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedFleetId) params.set("fleet_id", selectedFleetId);
    const res = await adminFetch<{ zones: ServiceZone[]; count: number }>(`/api/admin/marketplace/service-zones?${params.toString()}`);
    if (res.data) setZones(res.data.zones ?? []);
    setLoading(false);
  }, [selectedFleetId]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  // Fetch fleets for picker
  useEffect(() => {
    (async () => {
      const res = await adminFetch<{ fleets: FleetOption[] }>(`/api/admin/fleets?limit=100`);
      if (res.data) setFleetOptions(res.data.fleets ?? []);
    })();
  }, []);

  const handleBulkAdd = async () => {
    if (!selectedFleetId || !bulkInput.trim()) {
      Alert.alert("Missing", "Select a fleet and enter at least one H3 cell");
      return;
    }

    const cells = bulkInput.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (cells.length === 0) return;

    setInserting(true);
    try {
      const res = await adminFetch<{ inserted: number; duplicates_skipped: number }>("/api/admin/marketplace/service-zones", {
        method: "POST",
        body: JSON.stringify({ fleet_id: selectedFleetId, h3_cells: cells }),
      });
      if (res.error) {
        Alert.alert("Error", res.message ?? res.error);
      } else {
        Alert.alert("Done", `Inserted ${res.data?.inserted ?? 0}, skipped ${res.data?.duplicates_skipped ?? 0} duplicates`);
        setBulkInput("");
        fetchZones();
      }
    } finally {
      setInserting(false);
    }
  };

  const handleDelete = async (zone: ServiceZone) => {
    Alert.alert("Delete Zone", `Remove cell ${zone.h3_cell}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const res = await adminFetch("/api/admin/marketplace/service-zones", {
            method: "DELETE",
            body: JSON.stringify({ id: zone.id }),
          });
          if (res.error) {
            Alert.alert("Error", res.message ?? res.error);
          } else {
            setZones((prev) => prev.filter((z) => z.id !== zone.id));
          }
        },
      },
    ]);
  };

  const columns: AdminColumn<ServiceZone>[] = [
    { key: "h3_cell", header: "H3 Cell", width: 200 },
    { key: "resolution", header: "Res", width: 60 },
    { key: "is_active", header: "Active", width: 70, render: (r) => (
      <Text style={{ color: r.is_active ? colors.primary : colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
        {r.is_active ? "Yes" : "No"}
      </Text>
    )},
    { key: "created_at", header: "Added", width: 100, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
    { key: "actions", header: "", width: 80, render: (r) => (
      <Pressable onPress={() => handleDelete(r)}>
        <Text style={{ color: colors.danger, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>Remove</Text>
      </Pressable>
    )},
  ];

  return (
    <AdminShell title="Service Zones" subtitle="Fleet coverage areas (res-8 H3 cells)">
      {/* Fleet picker */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <View style={{ flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 8 }}>
          <select
            value={selectedFleetId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedFleetId(e.target.value)}
            style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }}
          >
            <option value="">All fleets</option>
            {fleetOptions.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </View>
      </View>

      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 12 }}>
        {zones.length} cell{zones.length !== 1 ? "s" : ""} {selectedFleetId ? "for selected fleet" : "total"}
      </Text>

      {/* Bulk add */}
      <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#2A2D35" }}>
        <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 14, marginBottom: 8 }}>Bulk Add Cells</Text>
        <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 8 }}>
          Enter one res-8 H3 cell per line. res-9 cells will be rejected.
        </Text>
        <textarea
          value={bulkInput}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setBulkInput(e.target.value)}
          placeholder={"8872a5a4bfffff0\n8872a5a4cfffff0\n8872a5a4dfffff0"}
          style={{ background: "transparent", color: colors.textPrimaryDark, border: "1px solid #2A2D35", borderRadius: 8, padding: 10, width: "100%", height: 120, fontFamily: "monospace", fontSize: 12, resize: "vertical" as const }}
        />
        <Pressable
          onPress={handleBulkAdd}
          disabled={inserting || !selectedFleetId || !bulkInput.trim()}
          style={{ backgroundColor: colors.adminAccent, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 8, opacity: inserting || !selectedFleetId || !bulkInput.trim() ? 0.5 : 1 }}
        >
          <Text style={{ color: colors.darkSurface, fontFamily: "Jakarta-SemiBold", fontSize: 13 }}>
            {inserting ? "Adding..." : "Add Cells"}
          </Text>
        </Pressable>
      </View>

      {/* Zone table */}
      <AdminTable
        columns={columns}
        rows={zones}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No service zones"
      />
    </AdminShell>
  );
}
