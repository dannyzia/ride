/**
 * Admin Marketplace Emergency — requests read-only table.
 * Route: /admin/marketplace/emergency
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface EmergencyRequest {
  id: string;
  status: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  accepted: "#3B82F6",
  dispatched: "#8B5CF6",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

export default function MarketplaceEmergency() {
  const [requests, setRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const res = await adminFetch<{ requests: EmergencyRequest[]; total: number }>(`/api/admin/marketplace/emergency?${params.toString()}`);
    if (res.data) { setRequests(res.data.requests ?? []); setTotal(res.data.total ?? 0); }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns: AdminColumn<EmergencyRequest>[] = [
    { key: "status", header: "Status", width: 110, sortable: true, render: (r) => {
      const c = STATUS_COLORS[r.status] ?? "#6B7280";
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.status}</Text>
        </View>
      );
    }},
    { key: "pickup_address", header: "Pickup", width: 300, render: (r) => (
      <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }} numberOfLines={1}>{r.pickup_address}</Text>
    )},
    { key: "created_at", header: "Created", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
  ];

  return (
    <AdminShell title="Emergencies" subtitle="Emergency dispatch requests (read-only)">
      <AdminTable
        columns={columns}
        rows={requests}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No emergency requests"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </AdminShell>
  );
}
