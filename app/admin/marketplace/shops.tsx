/**
 * Admin Marketplace Shops — list, search, suspend/restore.
 * Route: /admin/marketplace/shops
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ShopRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  owner_user_id: string;
  is_verified: boolean;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#0CC25F",
  suspended: "#F97316",
  closed: "#6B7280",
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? "#6B7280";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{status}</Text>
    </View>
  );
}

function ShopActions({ shop, onStatusChange }: { shop: ShopRow; onStatusChange: (id: string, status: string) => void }) {
  const [loading, setLoading] = useState(false);

  const toggleStatus = async (newStatus: string) => {
    setLoading(true);
    try {
      const res = await adminFetch(`/api/admin/marketplace/shops/${shop.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.error) {
        Alert.alert("Error", res.message ?? res.error);
      } else {
        onStatusChange(shop.id, newStatus);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="small" color={colors.adminAccent} />;

  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {shop.status === "active" && (
        <Pressable
          onPress={() => Alert.alert("Suspend Shop", `Suspend "${shop.name}"?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Suspend", style: "destructive", onPress: () => toggleStatus("suspended") },
          ])}
          style={{ backgroundColor: "#F9731620", borderWidth: 1, borderColor: "#F9731640", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Text style={{ color: "#F97316", fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>Suspend</Text>
        </Pressable>
      )}
      {shop.status === "suspended" && (
        <Pressable
          onPress={() => toggleStatus("active")}
          style={{ backgroundColor: "#0CC25F20", borderWidth: 1, borderColor: "#0CC25F40", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}
        >
          <Text style={{ color: "#0CC25F", fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>Restore</Text>
        </Pressable>
      )}
    </View>
  );
}

export default function MarketplaceShops() {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    params.set("page", String(page));
    params.set("limit", String(PAGE_SIZE));

    const res = await adminFetch<{ shops: ShopRow[]; total: number }>(`/api/admin/marketplace/shops?${params.toString()}`);
    if (res.data) {
      setShops(res.data.shops ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [search, statusFilter, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = (id: string, newStatus: string) => {
    setShops((prev) => prev.map((s) => s.id === id ? { ...s, status: newStatus } : s));
  };

  const columns: AdminColumn<ShopRow>[] = [
    { key: "name", header: "Shop", width: 200, sortable: true, render: (r) => (
      <View>
        <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 13 }}>{r.name}</Text>
        <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11, marginTop: 2 }}>{r.slug}</Text>
      </View>
    )},
    { key: "status", header: "Status", width: 100, sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    { key: "is_verified", header: "Verified", width: 80, render: (r) => (
      <Text style={{ color: r.is_verified ? colors.primary : colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
        {r.is_verified ? "Yes" : "No"}
      </Text>
    )},
    { key: "created_at", header: "Created", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>
        {new Date(r.created_at).toLocaleDateString()}
      </Text>
    )},
    { key: "actions", header: "Actions", width: 120, render: (r) => <ShopActions shop={r} onStatusChange={handleStatusChange} /> },
  ];

  return (
    <AdminShell title="Shops" subtitle="Manage marketplace shops">
      <View style={{ flexDirection: "row", marginBottom: 12, gap: 8, alignItems: "center" }}>
        <View style={{ flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 8 }}>
          <input
            type="text"
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }}
            placeholder="Search shops..."
          />
        </View>
        {(["", "active", "suspended", "closed"] as const).map((s) => (
          <Pressable
            key={s}
            onPress={() => { setStatusFilter(s); setPage(1); }}
            style={{ backgroundColor: statusFilter === s ? colors.adminAccent : colors.darkSecondary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: statusFilter === s ? colors.adminAccent : "#2A2D35" }}
          >
            <Text style={{ color: statusFilter === s ? colors.darkSurface : colors.textSecondaryDark, fontFamily: statusFilter === s ? "Jakarta-SemiBold" : "Jakarta-Regular", fontSize: 11 }}>
              {s || "All"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 8 }}>
        {total} shop{total !== 1 ? "s" : ""} total
      </Text>
      <AdminTable
        columns={columns}
        rows={shops}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No shops found"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </AdminShell>
  );
}
