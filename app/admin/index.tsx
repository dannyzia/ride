import { useState, useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface DashboardStats {
  active_drivers: number;
  pending_approvals: number;
  today_rides: number;
  today_commission_bdt: number;
  pending_documents: number;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 12, padding: 16, minWidth: 140, borderWidth: 1, borderColor: "#2A2D35" }}>
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontFamily: "Jakarta-Bold", fontSize: 28, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await adminFetch<DashboardStats>("/api/admin/dashboard");
      if (res.data) setStats(res.data);
      setLoading(false);
    })();
  }, []);

  return (
    <AdminShell title="Dashboard" subtitle="Operational overview">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <StatCard label="Active Drivers" value={String(stats?.active_drivers ?? 0)} color={colors.primary} />
          <StatCard label="Pending Approvals" value={String(stats?.pending_approvals ?? 0)} color={colors.amber} />
          <StatCard label="Today's Rides" value={String(stats?.today_rides ?? 0)} color={colors.adminAccent} />
          <StatCard label="Today Commission" value={`৳${((stats?.today_commission_bdt ?? 0) / 100).toFixed(0)}`} color={colors.primary} />
          <StatCard label="Pending Documents" value={String(stats?.pending_documents ?? 0)} color={stats && stats.pending_documents > 0 ? colors.danger : colors.textSecondaryDark} />
        </View>
      )}
    </AdminShell>
  );
}
