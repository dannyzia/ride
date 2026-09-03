/**
 * Admin Marketplace Couriers — list (type filter, presence, completed_count).
 * Route: /admin/marketplace/couriers
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface CourierRow {
  id: string;
  user_id: string;
  courier_type: string;
  status: string;
  is_online: boolean;
  last_seen_at: string | null;
  completed_count: number;
  created_at: string;
  user_name: string | null;
  user_phone: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#0CC25F",
  suspended: "#F97316",
};

export default function MarketplaceCouriers() {
  const [couriers, setCouriers] = useState<CourierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (typeFilter) params.set("type", typeFilter);
    const res = await adminFetch<{ couriers: CourierRow[]; total: number }>(`/api/admin/marketplace/couriers?${params.toString()}`);
    if (res.data) { setCouriers(res.data.couriers ?? []); setTotal(res.data.total ?? 0); }
    setLoading(false);
  }, [typeFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusToggle = async (courier: CourierRow) => {
    const newStatus = courier.status === "active" ? "suspended" : "active";
    Alert.alert(`Courier ${newStatus}`, `Set "${courier.user_name ?? courier.user_id.slice(0, 8)}" to ${newStatus}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: newStatus === "suspended" ? "Suspend" : "Restore",
        style: newStatus === "suspended" ? "destructive" : "default",
        onPress: async () => {
          const res = await adminFetch(`/api/admin/marketplace/couriers/${courier.id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: newStatus }),
          });
          if (res.error) {
            Alert.alert("Error", res.message ?? res.error);
          } else {
            setCouriers((prev) => prev.map((c) => c.id === courier.id ? { ...c, status: newStatus } : c));
          }
        },
      },
    ]);
  };

  const columns: AdminColumn<CourierRow>[] = [
    { key: "user_name", header: "Name", width: 150, render: (r) => (
      <View>
        <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 }}>{r.user_name ?? "Unknown"}</Text>
        <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11, marginTop: 2 }}>{r.user_phone ?? "—"}</Text>
      </View>
    )},
    { key: "courier_type", header: "Type", width: 80, sortable: true },
    { key: "status", header: "Status", width: 100, sortable: true, render: (r) => {
      const c = STATUS_COLORS[r.status] ?? "#6B7280";
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.status}</Text>
        </View>
      );
    }},
    { key: "is_online", header: "Online", width: 70, render: (r) => (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: r.is_online ? "#0CC25F" : "#6B7280" }} />
        <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{r.is_online ? "Yes" : "No"}</Text>
      </View>
    )},
    { key: "completed_count", header: "Trips", width: 70, sortable: true },
    { key: "created_at", header: "Joined", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
    { key: "actions", header: "Actions", width: 100, render: (r) => (
      <Pressable onPress={() => handleStatusToggle(r)}>
        <Text style={{ color: r.status === "active" ? colors.danger : colors.primary, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>
          {r.status === "active" ? "Suspend" : "Restore"}
        </Text>
      </Pressable>
    )},
  ];

  return (
    <AdminShell title="Couriers" subtitle="Courier capabilities (parcel + food)">
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["", "parcel", "food"] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => { setTypeFilter(t); setPage(1); }}
            style={{ backgroundColor: typeFilter === t ? colors.adminAccent : colors.darkSecondary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: typeFilter === t ? colors.adminAccent : "#2A2D35" }}
          >
            <Text style={{ color: typeFilter === t ? colors.darkSurface : colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>
              {t || "All"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 8 }}>
        {total} courier{total !== 1 ? "s" : ""} total
      </Text>
      <AdminTable
        columns={columns}
        rows={couriers}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No couriers found"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </AdminShell>
  );
}
