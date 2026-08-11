import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

const STATUS_COLORS: Record<string, string> = { open: colors.amber, under_review: colors.info, resolved: colors.checkGreen, escalated: colors.danger };
const RES_COLORS: Record<string, string> = { auto_approved: colors.primary, auto_rejected: colors.textSecondaryDark, admin_approved: colors.checkGreen, admin_rejected: colors.danger, pending: colors.amber };

export default function AdminFareDisputes() {
  const toast = useAdminToast();
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [adjustmentTaka, setAdjustmentTaka] = useState("");

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    const params = filter ? `?status=${filter}` : "";
    const res = await adminFetch<{ disputes: any[] }>(`/api/admin/fare-disputes${params}`);
    if (res.data) setDisputes(res.data.disputes ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  const resolve = async (action: 'admin_approved' | 'admin_rejected') => {
    if (!selected) return;
    const adjBdt = parseInt(adjustmentTaka, 10) * 100 || undefined;
    const res = await adminFetch(`/api/admin/fare-disputes`, {
      method: "PATCH", body: JSON.stringify({ dispute_id: selected.id, action, adjustment_bdt: adjBdt }), headers: { "Content-Type": "application/json" },
    });
    if (res.data) { toast.show(`Dispute ${action.replace('admin_', '')}`, "success"); setSelected(null); setAdjustmentTaka(""); fetchDisputes(); }
    else { toast.show(res.error ?? "Failed", "error"); }
  };

  return (
    <AdminShell title="Fare Disputes" subtitle="Rider fare dispute arbitration queue">
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        {["", "open", "under_review", "resolved"].map((s) => (
          <Pressable key={s} onPress={() => setFilter(s)}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: filter === s ? colors.adminAccent : colors.darkSecondary }}>
            <Text style={{ color: filter === s ? "#000" : colors.textPrimaryDark, fontFamily: "Jakarta-SemiBold", fontSize: 12 }}>{s || "All"}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} /> : (
        <FlatList data={disputes} keyExtractor={(r: any) => r.id}
          ListEmptyComponent={<Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", textAlign: "center", marginTop: 40 }}>No disputes found</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => { setSelected(item); setAdjustmentTaka(""); }} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.reason} numberOfLines={1}>{item.dispute_reason?.replace(/_/g, " ")}</Text>
                <Text style={[styles.statusBadge, { color: STATUS_COLORS[item.status] ?? colors.textSecondaryDark }]}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              <Text style={styles.meta}>Claimed: ৳{((item.claimed_fare_bdt ?? 0) / 100).toFixed(0)} | Charged: ৳{((item.charged_fare_bdt ?? 0) / 100).toFixed(0)}</Text>
              {item.final_resolution && <Text style={[styles.meta, { color: RES_COLORS[item.final_resolution] ?? colors.textSecondaryDark, marginTop: 2 }]}>Resolution: {item.final_resolution.replace(/_/g, " ")}</Text>}
            </Pressable>
          )}
        />
      )}
      <AdminModal visible={!!selected} title={`Dispute: ${selected?.dispute_reason ?? ""}`} onClose={() => setSelected(null)}>
        <Text style={styles.label}>Ride: {selected?.ride_id?.slice(0, 8)}</Text>
        <Text style={styles.label}>Claimed: ৳{((selected?.claimed_fare_bdt ?? 0) / 100).toFixed(0)}</Text>
        <Text style={styles.label}>Charged: ৳{((selected?.charged_fare_bdt ?? 0) / 100).toFixed(0)}</Text>
        <Text style={styles.label}>Status: {selected?.status}</Text>
        {selected?.rider_note && <Text style={styles.label}>Note: {selected.rider_note}</Text>}
        {selected?.auto_refund_bdt > 0 && <Text style={styles.label}>Auto refund: ৳{((selected.auto_refund_bdt) / 100).toFixed(0)}</Text>}
        {selected?.status !== 'resolved' && (
          <>
            <Text style={[styles.label, { marginTop: 12, color: colors.textSecondaryDark }]}>Adjustment (BDT, optional):</Text>
            <View style={styles.adjustInput}>
              <input type="number" value={adjustmentTaka} onChange={(e: any) => setAdjustmentTaka(e.target.value)} placeholder="e.g. 30"
                style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <Pressable onPress={() => resolve('admin_approved')} style={[styles.actionBtn, { backgroundColor: colors.primary }]}>
                <Text style={styles.actionText}>Approve Refund</Text>
              </Pressable>
              <Pressable onPress={() => resolve('admin_rejected')} style={[styles.actionBtn, { backgroundColor: colors.danger }]}>
                <Text style={[styles.actionText, { color: "#FFF" }]}>Reject</Text>
              </Pressable>
            </View>
          </>
        )}
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.darkSecondary, padding: 12, marginBottom: 6, borderRadius: 8 },
  reason: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 13, flex: 1 },
  statusBadge: { fontFamily: "Jakarta-Bold", fontSize: 11 },
  meta: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 },
  label: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13, marginBottom: 4 },
  adjustInput: { backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 8, marginBottom: 8 },
  actionBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: "center" },
  actionText: { color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 },
});
