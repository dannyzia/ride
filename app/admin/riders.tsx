import { useState, useEffect, useCallback } from "react";
import { View, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface Rider {
  id: string; name: string; phone: string; email: string | null;
  account_status: string; total_rides: number; total_spent_bdt: number;
  fraud_score: number; last_ride_at: string | null; created_at: string;
}

export default function AdminRiders() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRiders = useCallback(async () => {
    setLoading(true);
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    const res = await adminFetch<{ riders: Rider[] }>(`/api/admin/riders${params}`);
    if (res.data) setRiders(res.data.riders ?? []);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchRiders(); }, [fetchRiders]);

  const columns: AdminColumn<Rider>[] = [
    { key: "name", header: "Name", width: 150 },
    { key: "phone", header: "Phone", width: 120 },
    { key: "total_rides", header: "Rides", width: 60 },
    { key: "total_spent_bdt", header: "Spent", render: (r) => `৳${((r.total_spent_bdt ?? 0) / 100).toFixed(0)}`, width: 80 },
    { key: "account_status", header: "Status", width: 80 },
    { key: "created_at", header: "Joined", render: (r) => new Date(r.created_at).toLocaleDateString(), width: 100 },
  ];

  return (
    <AdminShell title="Rider Management" subtitle="View and manage rider accounts">
      <View style={{ flexDirection: "row", marginBottom: 12 }}>
        <View style={{ flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 8 }}>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }}
            placeholder="Search by name..." />
        </View>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <AdminTable columns={columns} rows={riders} rowKey={(r) => r.id} />
      )}
    </AdminShell>
  );
}
