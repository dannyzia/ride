/**
 * Admin Marketplace Overview — vertical counts by status (30d) + SLA-fault table.
 * Route: /admin/marketplace/overview
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface StatusCount {
  status: string;
  count: number;
}

interface SlaFault {
  fleet_id: string | null;
  fleet_name: string;
  timeout_count: number;
}

interface OverviewData {
  rental_requests: StatusCount[];
  rental_bids: StatusCount[];
  shop_orders: StatusCount[];
  delivery_requests: StatusCount[];
  delivery_legs: StatusCount[];
  sla_faults: SlaFault[];
  period_days: number;
}

function VerticalCard({ title, counts, color }: { title: string; counts: StatusCount[]; color: string }) {
  const total = counts.reduce((s, c) => s + c.count, 0);
  return (
    <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 12, padding: 16, minWidth: 200, borderWidth: 1, borderColor: "#2A2D35" }}>
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{title}</Text>
      <Text style={{ color, fontFamily: "Jakarta-Bold", fontSize: 28, marginTop: 4 }}>{total}</Text>
      {counts.length > 0 && (
        <View style={{ marginTop: 8, gap: 2 }}>
          {counts.map((c) => (
            <Text key={c.status} style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>
              {c.status}: {c.count}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function MarketplaceOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await adminFetch<OverviewData>("/api/admin/marketplace/overview");
    if (res.data) setData(res.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const slaColumns: AdminColumn<SlaFault>[] = [
    { key: "fleet_name", header: "Fleet", width: 250, sortable: true },
    { key: "timeout_count", header: "SLA Timeouts", width: 120, sortable: true },
    { key: "fleet_id", header: "Fleet ID", width: 300, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>
        {r.fleet_id ?? "—"}
      </Text>
    )},
  ];

  return (
    <AdminShell title="Marketplace Overview" subtitle="30-day vertical metrics + SLA-fault accountability">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : data ? (
        <View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
            <VerticalCard title="Rental Requests" counts={data.rental_requests} color={colors.primary} />
            <VerticalCard title="Rental Bids" counts={data.rental_bids} color={colors.adminAccent} />
            <VerticalCard title="Shop Orders" counts={data.shop_orders} color="#F59E0B" />
            <VerticalCard title="Delivery Requests" counts={data.delivery_requests} color="#3B82F6" />
            <VerticalCard title="Delivery Legs" counts={data.delivery_legs} color="#8B5CF6" />
          </View>

          <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 16, marginBottom: 12 }}>
            SLA-Fault Accountability (30d)
          </Text>
          <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 8 }}>
            Fleets with driver_pick_sla_timeout events — the accountability signal (plan §1.1).
          </Text>
          <AdminTable
            columns={slaColumns}
            rows={data.sla_faults}
            rowKey={(r) => r.fleet_id ?? "unknown"}
            emptyMessage="No SLA faults in the last 30 days"
          />
        </View>
      ) : null}
    </AdminShell>
  );
}
