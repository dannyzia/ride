import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";

interface RidePass {
  id: string; name: string; description: string | null; price_bdt: number;
  discount_percent: number; max_rides: number | null; validity_days: number; is_active: boolean;
}

export default function RidePassesAdmin() {
  const toast = useAdminToast();
  const [passes, setPasses] = useState<RidePass[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price_bdt: "", discount_percent: "10", max_rides: "", validity_days: "30" });

  const fetchPasses = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ passes: RidePass[] }>("/api/admin/rider-passes");
    if (res.data) setPasses(res.data.passes ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchPasses(); }, [fetchPasses]);

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", description: "", price_bdt: "", discount_percent: "10", max_rides: "", validity_days: "30" });
    setModalVisible(true);
  };

  const openEdit = (pass: RidePass) => {
    setEditId(pass.id);
    setForm({
      name: pass.name, description: pass.description ?? "",
      price_bdt: String(pass.price_bdt / 100), discount_percent: String(pass.discount_percent),
      max_rides: pass.max_rides ? String(pass.max_rides) : "", validity_days: String(pass.validity_days),
    });
    setModalVisible(true);
  };

  const save = async () => {
    const body = { name: form.name, description: form.description || undefined, price_bdt: parseInt(form.price_bdt, 10) * 100, discount_percent: parseInt(form.discount_percent, 10), max_rides: form.max_rides ? parseInt(form.max_rides, 10) : undefined, validity_days: parseInt(form.validity_days, 10) };
    if (editId) {
      const res = await adminFetch("/api/admin/rider-passes", { method: "PATCH", body: JSON.stringify({ id: editId, ...body }), headers: { "Content-Type": "application/json" } });
      if (res.data) { toast.show("Pass updated", "success"); setModalVisible(false); fetchPasses(); }
      else { toast.show(res.error ?? "Failed", "error"); }
    } else {
      const res = await adminFetch("/api/admin/rider-passes", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      if (res.data) { toast.show("Pass created", "success"); setModalVisible(false); fetchPasses(); }
      else { toast.show(res.error ?? "Failed", "error"); }
    }
  };

  const removePass = (pass: RidePass) => {
    Alert.alert("Delete Pass?", `Deactivate "${pass.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Deactivate", style: "destructive", onPress: async () => {
        const res = await adminFetch(`/api/admin/rider-passes?id=${pass.id}`, { method: "DELETE" });
        if (res.data) { toast.show("Pass deactivated", "success"); fetchPasses(); }
        else { toast.show(res.error ?? "Failed", "error"); }
      }},
    ]);
  };

  const columns: AdminColumn<RidePass>[] = [
    { key: "name", header: "Name", width: 140 },
    { key: "price_bdt", header: "Price", render: (r) => `৳${(r.price_bdt / 100).toFixed(0)}`, width: 80 },
    { key: "discount_percent", header: "Disc %", width: 60 },
    { key: "validity_days", header: "Days", width: 50 },
    { key: "is_active", header: "Active", render: (r) => r.is_active ? "✅" : "⬜", width: 60 },
    { key: "id", header: "Actions", render: (r) => (
      <View className="flex-row gap-2">
        <Pressable onPress={() => openEdit(r)} className="px-[8px] py-[4px] bg-goAdminAccent rounded-[4px]"><Text className="text-goBgDark font-JakartaBold text-[11px]">Edit</Text></Pressable>
        <Pressable onPress={() => removePass(r)} className="px-[8px] py-[4px] bg-goDanger rounded-[4px]"><Text className="text-goWhite font-JakartaBold text-[11px]">Del</Text></Pressable>
      </View>
    ), width: 100 },
  ];

  return (
    <AdminShell title="Ride Passes" subtitle="Create and manage rider pass types">
      <Pressable onPress={openAdd} className="py-[12px] px-[12px] bg-goAdminAccent rounded-[8px] self-start mb-3">
        <Text className="text-goBgDark font-JakartaBold text-[13px]">+ Add Pass</Text>
      </Pressable>
      {loading ? <ActivityIndicator size="large" className="mt-10" /> : <AdminTable columns={columns} rows={passes} rowKey={(r) => r.id} />}
      <AdminModal visible={modalVisible} title={editId ? "Edit Ride Pass" : "Add Ride Pass"} onClose={() => setModalVisible(false)}>
        <View className="gap-[10px]">
          {([["name", "Name"], ["price_bdt", "Price (BDT)"], ["discount_percent", "Discount %"], ["validity_days", "Validity (days)"], ["max_rides", "Max rides (blank=unlimited)"]] as [string, string][]).map(([f, label]) => (
            <View key={f}>
              <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">{label}</Text>
              <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
                value={(form as any)[f]} onChangeText={(v) => setForm({ ...form, [f]: v })} keyboardType={f === "name" ? "default" : "numeric"} />
            </View>
          ))}
          <Pressable onPress={save} className="py-[12px] bg-goAdminAccent rounded-[8px] items-center">
            <Text className="text-goBgDark font-JakartaBold text-[14px]">{editId ? "Update Pass" : "Create Pass"}</Text>
          </Pressable>
        </View>
      </AdminModal>
    </AdminShell>
  );
}
