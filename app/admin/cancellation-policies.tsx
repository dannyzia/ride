import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface Policy {
  id: string; name: string; canceller_role: string; ride_status: string;
  time_threshold_seconds: number; fee_type: string; fee_amount_bdt: number;
  max_fee_bdt: number; is_active: boolean; priority: number;
}

export default function CancellationPolicies() {
  const toast = useAdminToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({ name: "", canceller_role: "rider", ride_status: "matched", time_threshold_seconds: "120", fee_type: "flat", fee_amount_bdt: "0", max_fee_bdt: "0" });

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ policies: Policy[] }>("/api/admin/cancellation-policies");
    if (res.data) setPolicies(res.data.policies ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPolicies(); }, [fetchPolicies]);

  const save = async () => {
    const body = { ...form, time_threshold_seconds: parseInt(form.time_threshold_seconds, 10), fee_amount_bdt: parseInt(form.fee_amount_bdt, 10) * 100, max_fee_bdt: parseInt(form.max_fee_bdt, 10) * 100, priority: 1 };
    const res = await adminFetch("/api/admin/cancellation-policies", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    });
    if (res.data) { toast.show("Saved", "success"); setModalVisible(false); fetchPolicies(); }
    else { toast.show(res.error ?? "Failed", "error"); }
  };

  const columns: AdminColumn<Policy>[] = [
    { key: "name", header: "Name", width: 140 },
    { key: "canceller_role", header: "Role", width: 70 },
    { key: "ride_status", header: "Ride Status", width: 100 },
    { key: "fee_amount_bdt", header: "Fee (BDT)", render: (r) => `৳${(r.fee_amount_bdt / 100).toFixed(0)}`, width: 80 },
    { key: "time_threshold_seconds", header: "Grace (s)", width: 70 },
    { key: "is_active", header: "Active", render: (r) => r.is_active ? "✅" : "⬜", width: 60 },
  ];

  return (
    <AdminShell title="Cancellation Policies" subtitle="Manage cancellation fee rules">
      <Pressable onPress={() => { setForm({ name: "", canceller_role: "rider", ride_status: "matched", time_threshold_seconds: "120", fee_type: "flat", fee_amount_bdt: "0", max_fee_bdt: "0" }); setModalVisible(true); }}
        style={{ padding: 12, backgroundColor: colors.adminAccent, borderRadius: 8, alignSelf: "flex-start", marginBottom: 12 }}>
        <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 }}>+ Add Policy</Text>
      </Pressable>
      {loading ? <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
        : <AdminTable columns={columns} rows={policies} rowKey={(r) => r.id} />}
      <AdminModal visible={modalVisible} title="Add Policy" onClose={() => setModalVisible(false)}>
        <View style={{ gap: 10 }}>
          {["name", "canceller_role", "ride_status", "time_threshold_seconds", "fee_amount_bdt", "max_fee_bdt"].map((f) => (
            <View key={f}>
              <Text style={{ color: colors.textSecondaryDark, fontSize: 12, fontFamily: "Jakarta-Regular" }}>{f}</Text>
              <View style={{ backgroundColor: colors.darkSecondary, borderRadius: 8, padding: 8 }}>
                <input type="text" value={(form as any)[f]} onChange={(e: any) => setForm({ ...form, [f]: e.target.value })}
                  style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }} />
              </View>
            </View>
          ))}
          <Pressable onPress={save} style={{ paddingVertical: 12, backgroundColor: colors.adminAccent, borderRadius: 8, alignItems: "center" }}>
            <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 14 }}>Save</Text>
          </Pressable>
        </View>
      </AdminModal>
    </AdminShell>
  );
}
