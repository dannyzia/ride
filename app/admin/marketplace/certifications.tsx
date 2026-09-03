/**
 * Admin Marketplace Certifications — pending-queue review UI.
 * Route: /admin/marketplace/certifications
 * Uses existing PATCH /api/admin/marketplace/certifications/[id] from Phase 6.
 */
import { useState, useEffect, useCallback } from "react";
import { View, Text, ActivityIndicator, Pressable, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface CertRow {
  id: string;
  user_id: string;
  fleet_id: string;
  cert_type: string;
  service_level: string;
  certification_status: string;
  review_notes: string | null;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#F59E0B",
  verified: "#0CC25F",
  revoked: "#E31D1C",
  expired: "#9CA3AF",
};

export default function MarketplaceCertifications() {
  const [certs, setCerts] = useState<CertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    // Fetch from ambulance certifications endpoint (shared with admin)
    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    const res = await adminFetch<{ certifications: CertRow[]; total: number }>(`/api/admin/marketplace/certifications?${params.toString()}`);
    if (res.data) {
      setCerts(res.data.certifications ?? []);
      setTotal(res.data.total ?? 0);
    }
    setLoading(false);
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleReview = async (certId: string, status: "verified" | "revoked") => {
    Alert.alert(`Review Certification`, `Set to ${status}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: status === "verified" ? "Verify" : "Revoke",
        style: status === "revoked" ? "destructive" : "default",
        onPress: async () => {
          const res = await adminFetch(`/api/admin/marketplace/certifications/${certId}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          });
          if (res.error) {
            Alert.alert("Error", res.message ?? res.error);
          } else {
            setCerts((prev) => prev.map((c) => c.id === certId ? { ...c, certification_status: status } : c));
          }
        },
      },
    ]);
  };

  const columns: AdminColumn<CertRow>[] = [
    { key: "cert_type", header: "Type", width: 120 },
    { key: "service_level", header: "Level", width: 80 },
    { key: "certification_status", header: "Status", width: 100, render: (r) => {
      const c = STATUS_COLORS[r.certification_status] ?? "#6B7280";
      return (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ color: c, fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>{r.certification_status}</Text>
        </View>
      );
    }},
    { key: "user_id", header: "User", width: 150, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>{r.user_id.slice(0, 8)}...</Text>
    )},
    { key: "fleet_id", header: "Fleet", width: 150, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>{r.fleet_id.slice(0, 8)}...</Text>
    )},
    { key: "created_at", header: "Created", width: 100, render: (r) => (
      <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</Text>
    )},
    { key: "actions", header: "Actions", width: 150, render: (r) => (
      <View style={{ flexDirection: "row", gap: 6 }}>
        {r.certification_status === "pending" && (
          <>
            <Pressable onPress={() => handleReview(r.id, "verified")} style={{ backgroundColor: "#0CC25F20", borderWidth: 1, borderColor: "#0CC25F40", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: "#0CC25F", fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>Verify</Text>
            </Pressable>
            <Pressable onPress={() => handleReview(r.id, "revoked")} style={{ backgroundColor: "#E31D1C20", borderWidth: 1, borderColor: "#E31D1C40", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: "#E31D1C", fontFamily: "Jakarta-SemiBold", fontSize: 11 }}>Revoke</Text>
            </Pressable>
          </>
        )}
      </View>
    )},
  ];

  return (
    <AdminShell title="Certifications" subtitle="Ambulance certification review queue">
      <AdminTable
        columns={columns}
        rows={certs}
        rowKey={(r) => r.id}
        loading={loading}
        emptyMessage="No certifications"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />
    </AdminShell>
  );
}
