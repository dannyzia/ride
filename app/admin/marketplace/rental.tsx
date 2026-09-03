/**
 * Admin Marketplace Rental — requests table → detail drawer (bids, events timeline).
 * Route: /admin/marketplace/rental
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, ScrollView } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface RentalRequest {
  id: string;
  category: string;
  status: string;
  pickup_address: string;
  dropoff_address: string | null;
  urgency: string;
  tracking_required: boolean;
  created_at: string;
  awarded_at: string | null;
  rental_options: string | null;
  scheduled_start_at: string | null;
  duration_hours: number | null;
}

interface RentalBid {
  id: string;
  fleet_id: string;
  vehicle_type: string;
  quoted_price_bdt: number;
  overtime_rate_bdt: number | null;
  status: string;
  submitted_at: string;
}

interface RentalEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  broadcasting: "#3B82F6",
  collecting: "#F59E0B",
  awarded: "#0CC25F",
  confirmed: "#8B5CF6",
  completed: "#6B7280",
  cancelled: "#EF4444",
  expired: "#9CA3AF",
  no_bidders: "#9CA3AF",
};

export default function MarketplaceRental() {
  const [requests, setRequests] = useState<RentalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedRequest, setSelectedRequest] = useState<RentalRequest | null>(null);
  const [detailBids, setDetailBids] = useState<RentalBid[]>([]);
  const [detailEvents, setDetailEvents] = useState<RentalEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const res = await adminFetch<{ requests: RentalRequest[]; total: number }>(`/api/admin/marketplace/rental/requests?${params.toString()}`);
    if (res.data) {
      setRequests(res.data.requests ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDetail = async (req: RentalRequest) => {
    setSelectedRequest(req);
    setDetailLoading(true);
    const res = await adminFetch<{ bids: RentalBid[]; events: RentalEvent[] }>(`/api/admin/marketplace/rental/requests/${req.id}`);
    if (res.data) {
      setDetailBids(res.data.bids ?? []);
      setDetailEvents(res.data.events ?? []);
    }
    setDetailLoading(false);
  };

  const columns: AdminColumn<RentalRequest>[] = [
    { key: "category", header: "Category", width: 120, sortable: true },
    { key: "status", header: "Status", width: 110, sortable: true, render: (r) => {
      const c = STATUS_COLORS[r.status] ?? "#6B7280";
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.status}</Text>
        </View>
      );
    }},
    { key: "urgency", header: "Urgency", width: 80, sortable: true },
    { key: "pickup_address", header: "Pickup", width: 200, render: (r) => (
      <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }} numberOfLines={1}>{r.pickup_address}</Text>
    )},
    { key: "dropoff_address", header: "Dropoff", width: 200, render: (r) => (
      <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }} numberOfLines={1}>{r.dropoff_address ?? "—"}</Text>
    )},
    { key: "created_at", header: "Created", width: 100, sortable: true, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
  ];

  return (
    <AdminShell title="Rental Requests" subtitle="Request lifecycle + bid evidence">
      <AdminTable
        columns={columns}
        rows={requests}
        rowKey={(r) => r.id}
        onRowPress={openDetail}
        loading={loading}
        emptyMessage="No rental requests in the last 30 days"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      {/* Detail Drawer */}
      {selectedRequest && (
        <View style={{ position: "fixed" as unknown as "absolute", top: 0, right: 0, bottom: 0, width: 450, backgroundColor: "#181A20", borderLeftWidth: 1, borderLeftColor: "#2A2D35", zIndex: 200, padding: 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 16 }}>Request Detail</Text>
            <Pressable onPress={() => setSelectedRequest(null)}>
              <Text style={{ color: colors.adminAccent, fontFamily: "Jakarta-SemiBold", fontSize: 13 }}>Close</Text>
            </Pressable>
          </View>

          <ScrollView>
            {/* Request info */}
            <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#2A2D35" }}>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 14 }}>#{selectedRequest.id.slice(0, 8)}</Text>
              <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 4 }}>{selectedRequest.category} · {selectedRequest.status}</Text>
              <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 2 }}>{selectedRequest.pickup_address} → {selectedRequest.dropoff_address ?? "—"}</Text>
              {selectedRequest.rental_options && <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 4 }}>Options: {selectedRequest.rental_options}</Text>}
              {selectedRequest.scheduled_start_at && <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 2 }}>Scheduled: {new Date(selectedRequest.scheduled_start_at).toLocaleString()}</Text>}
              {selectedRequest.duration_hours && <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 2 }}>Duration: {selectedRequest.duration_hours}h</Text>}
            </View>

            {/* Bids */}
            <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 14, marginBottom: 8 }}>Bids ({detailBids.length})</Text>
            {detailLoading ? (
              <ActivityIndicator color={colors.adminAccent} />
            ) : (
              detailBids.map((bid) => (
                <View key={bid.id} style={{ backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#2A2D35" }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.primary, fontFamily: "Jakarta-Bold", fontSize: 16 }}>৳{(bid.quoted_price_bdt / 100).toFixed(0)}</Text>
                    <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{bid.status}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondaryDark, fontSize: 12, marginTop: 4 }}>{bid.vehicle_type.replace(/_/g, " ")}</Text>
                  {bid.overtime_rate_bdt != null && (
                    <Text style={{ color: colors.textSecondaryDark, fontSize: 11, marginTop: 2 }}>OT: ৳{(bid.overtime_rate_bdt / 100).toFixed(0)}/hr</Text>
                  )}
                </View>
              ))
            )}

            {/* Events Timeline */}
            <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 14, marginTop: 16, marginBottom: 8 }}>Events Timeline ({detailEvents.length})</Text>
            {detailEvents.map((ev) => (
              <View key={ev.id} style={{ flexDirection: "row", marginBottom: 8, gap: 10 }}>
                <View style={{ width: 2, backgroundColor: "#2A2D35" }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.adminAccent, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>{ev.event_type}</Text>
                  <Text style={{ color: colors.textSecondaryDark, fontSize: 11, marginTop: 2 }}>{new Date(ev.created_at).toLocaleString()}</Text>
                  {Object.keys(ev.payload).length > 0 && (
                    <Text style={{ color: colors.textSecondaryDark, fontSize: 10, marginTop: 2, fontFamily: "monospace" }}>
                      {JSON.stringify(ev.payload).slice(0, 200)}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </AdminShell>
  );
}
