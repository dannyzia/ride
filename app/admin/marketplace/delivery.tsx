/**
 * Admin Marketplace Delivery — requests + legs read-only tables.
 * Route: /admin/marketplace/delivery
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface DeliveryRequest {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  required_vehicle_type: string | null;
  declared_fee_bdt: number | null;
  quoted_fee_bdt: number | null;
  source_shop_order_id: string | null;
  created_at: string;
}

interface DeliveryLeg {
  id: string;
  delivery_request_id: string;
  courier_user_id: string;
  leg_state: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  assigned: "#3B82F6",
  picked_up: "#8B5CF6",
  in_transit: "#0CC25F",
  delivered: "#6B7280",
  cancelled: "#EF4444",
  expired: "#9CA3AF",
};

export default function MarketplaceDelivery() {
  const [activeTab, setActiveTab] = useState<"requests" | "legs">("requests");
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
  const [legs, setLegs] = useState<DeliveryLeg[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (activeTab === "requests") {
      const res = await adminFetch<{ requests: DeliveryRequest[]; total: number }>(`/api/admin/marketplace/delivery/requests?${params.toString()}`);
      if (res.data) { setRequests(res.data.requests ?? []); setTotal(res.data.total ?? 0); }
    } else {
      const res = await adminFetch<{ legs: DeliveryLeg[]; total: number }>(`/api/admin/marketplace/delivery/legs?${params.toString()}`);
      if (res.data) { setLegs(res.data.legs ?? []); setTotal(res.data.total ?? 0); }
    }
    setLoading(false);
  }, [activeTab, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const reqColumns: AdminColumn<DeliveryRequest>[] = [
    { key: "status", header: "Status", width: 110, sortable: true, render: (r) => {
      const c = STATUS_COLORS[r.status] ?? "#6B7280";
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.status}</Text>
        </View>
      );
    }},
    { key: "pickup_address", header: "Pickup", width: 200, render: (r) => (
      <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }} numberOfLines={1}>{r.pickup_address}</Text>
    )},
    { key: "dropoff_address", header: "Dropoff", width: 200, render: (r) => (
      <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }} numberOfLines={1}>{r.dropoff_address}</Text>
    )},
    { key: "source_shop_order_id", header: "Source", width: 100, render: (r) => (
      <Text style={{ color: r.source_shop_order_id ? "#F59E0B" : colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>
        {r.source_shop_order_id ? "Food" : "Direct"}
      </Text>
    )},
    { key: "created_at", header: "Created", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
  ];

  const legColumns: AdminColumn<DeliveryLeg>[] = [
    { key: "leg_state", header: "State", width: 110, sortable: true, render: (r) => {
      const c = STATUS_COLORS[r.leg_state] ?? "#6B7280";
      return <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.leg_state}</Text>;
    }},
    { key: "courier_user_id", header: "Courier", width: 200, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>{r.courier_user_id.slice(0, 8)}...</Text>
    )},
    { key: "created_at", header: "Created", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
  ];

  return (
    <AdminShell title="Deliveries" subtitle="Delivery requests and legs">
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {(["requests", "legs"] as const).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => { setActiveTab(tab); setPage(1); }}
            style={{ backgroundColor: activeTab === tab ? colors.adminAccent : colors.darkSecondary, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ color: activeTab === tab ? colors.darkSurface : colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>
              {tab === "requests" ? "Requests" : "Legs"}
            </Text>
          </Pressable>
        ))}
      </View>
      <AdminTable
        columns={(activeTab === "requests" ? reqColumns : legColumns) as AdminColumn<DeliveryRequest | DeliveryLeg>[]}
        rows={(activeTab === "requests" ? requests : legs) as (DeliveryRequest | DeliveryLeg)[]}
        rowKey={(r: DeliveryRequest | DeliveryLeg) => r.id}
        loading={loading}
        emptyMessage={`No delivery ${activeTab}`}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </AdminShell>
  );
}
