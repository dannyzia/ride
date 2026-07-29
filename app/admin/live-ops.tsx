import { useState, useEffect, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface LiveStats {
  active_drivers: number; dispatching: number; matched: number;
  in_progress: number; recent_completed: number;
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 12, padding: 16, minWidth: 140, borderWidth: 1, borderColor: "#2A2D35" }}>
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontFamily: "Jakarta-Bold", fontSize: 28, marginTop: 4 }}>{value}</Text>
    </View>
  );
}

export default function LiveOps() {
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const res = await adminFetch<LiveStats>("/api/admin/live-stats");
      if (res.data) setStats(res.data);
      setLoading(false);
    };
    fetchStats();
    intervalRef.current = setInterval(fetchStats, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <AdminShell title="Live Ops" subtitle="Real-time operational overview (auto-refresh 5s)">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <StatCard label="Active Drivers" value={String(stats?.active_drivers ?? 0)} color={colors.primary} />
          <StatCard label="Dispatching" value={String(stats?.dispatching ?? 0)} color={colors.amber} />
          <StatCard label="Matched" value={String(stats?.matched ?? 0)} color={colors.adminAccent} />
          <StatCard label="In Progress" value={String(stats?.in_progress ?? 0)} color={colors.primary} />
          <StatCard label="Completed (5m)" value={String(stats?.recent_completed ?? 0)} color={colors.primary} />
        </View>
      )}
    </AdminShell>
  );
}
