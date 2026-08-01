import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface IntroConfig {
  id: string;
  zone_id: string;
  zone_name: string | null;
  is_active: boolean;
  ride_number: number;
  discount_percent: number;
  max_discount_bdt: number | null;
  daily_cap_bdt: number;
  effective_from: string;
  effective_to: string | null;
}

interface ZoneOption {
  id: string;
  name: string;
}

const IntroConfigAdmin = () => {
  const toast = useAdminToast();
  const [configs, setConfigs] = useState<IntroConfig[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    zone_id: "",
    ride_number: "1",
    discount_percent: "50",
    max_discount_bdt: "",
    daily_cap_bdt: "10000",
    effective_from: "",
    effective_to: "",
    is_active: true,
  });

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ configs: IntroConfig[] }>("/api/admin/rider-intro-configs");
    if (res.data) setConfigs(res.data.configs ?? []);
    setLoading(false);
  }, []);

  const fetchZones = useCallback(async () => {
    const res = await adminFetch<{ zones: ZoneOption[] }>("/api/admin/zones");
    if (res.data) setZones(res.data.zones ?? []);
  }, []);

  useEffect(() => { fetchConfigs(); fetchZones(); }, [fetchConfigs, fetchZones]);

  const openAdd = () => {
    setEditId(null);
    setForm({
      zone_id: zones.length > 0 ? zones[0].id : "",
      ride_number: "1",
      discount_percent: "50",
      max_discount_bdt: "",
      daily_cap_bdt: "10000",
      effective_from: "",
      effective_to: "",
      is_active: true,
    });
    setModalVisible(true);
  };

  const openEdit = (config: IntroConfig) => {
    setEditId(config.id);
    setForm({
      zone_id: config.zone_id,
      ride_number: String(config.ride_number),
      discount_percent: String(config.discount_percent),
      max_discount_bdt: config.max_discount_bdt != null ? String(config.max_discount_bdt / 100) : "",
      daily_cap_bdt: String(config.daily_cap_bdt / 100),
      effective_from: config.effective_from ? config.effective_from.slice(0, 16) : "",
      effective_to: config.effective_to ? config.effective_to.slice(0, 16) : "",
      is_active: config.is_active,
    });
    setModalVisible(true);
  };

  const save = async () => {
    if (!form.zone_id) {
      toast.show("Please select a zone", "error");
      return;
    }
    if (!form.ride_number) {
      toast.show("Ride number is required", "error");
      return;
    }
    const body = {
      zone_id: form.zone_id,
      ride_number: parseInt(form.ride_number, 10),
      discount_percent: parseInt(form.discount_percent, 10),
      max_discount_bdt: form.max_discount_bdt ? parseInt(form.max_discount_bdt, 10) * 100 : null,
      daily_cap_bdt: parseInt(form.daily_cap_bdt, 10) * 100,
      effective_from: form.effective_from ? new Date(form.effective_from).toISOString() : undefined,
      effective_to: form.effective_to ? new Date(form.effective_to).toISOString() : null,
      is_active: form.is_active,
    };
    if (editId) {
      const res = await adminFetch("/api/admin/rider-intro-configs", {
        method: "PATCH",
        body: JSON.stringify({ id: editId, ...body }),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data) { toast.show("Config updated", "success"); setModalVisible(false); fetchConfigs(); }
      else { toast.show(res.error ?? "Failed", "error"); }
    } else {
      const res = await adminFetch("/api/admin/rider-intro-configs", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      if (res.data) { toast.show("Config created", "success"); setModalVisible(false); fetchConfigs(); }
      else { toast.show(res.error ?? "Failed", "error"); }
    }
  };

  const removeConfig = (config: IntroConfig) => {
    Alert.alert("Deactivate Config?", `Deactivate intro config for "${config.zone_name ?? config.zone_id}"? (Ride #${config.ride_number})`, [
      { text: "Cancel", style: "cancel" },
      { text: "Deactivate", style: "destructive", onPress: async () => {
        const res = await adminFetch(`/api/admin/rider-intro-configs?id=${config.id}`, { method: "DELETE" });
        if (res.data) { toast.show("Config deactivated", "success"); fetchConfigs(); }
        else { toast.show(res.error ?? "Failed", "error"); }
      }},
    ]);
  };

  const columns: AdminColumn<IntroConfig>[] = [
    { key: "zone_name", header: "Zone", width: 120 },
    { key: "ride_number", header: "Ride #", width: 50 },
    {
      key: "discount_percent",
      header: "Disc %",
      width: 60,
      render: (r) => `${r.discount_percent}%`,
    },
    {
      key: "max_discount_bdt",
      header: "Max Disc (৳)",
      width: 70,
      render: (r) => (r.max_discount_bdt != null ? `${(r.max_discount_bdt / 100).toFixed(0)}` : "—"),
    },
    {
      key: "daily_cap_bdt",
      header: "Daily Cap (৳)",
      width: 80,
      render: (r) => `${(r.daily_cap_bdt / 100).toFixed(0)}`,
    },
    { key: "is_active", header: "Active", render: (r) => r.is_active ? "✅" : "⬜", width: 60 },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <View className="flex-row gap-2">
          <Pressable onPress={() => openEdit(r)} style={styles.editBtn}><Text style={styles.editText}>Edit</Text></Pressable>
          <Pressable onPress={() => removeConfig(r)} style={styles.delBtn}><Text style={styles.delText}>Del</Text></Pressable>
        </View>
      ),
      width: 100,
    },
  ];

  return (
    <AdminShell title="Intro Configs" subtitle="Configure intro incentive discounts per zone">
      <Pressable onPress={openAdd} style={styles.addBtn}>
        <Text style={styles.addText}>+ Add Config</Text>
      </Pressable>
      {loading ? <ActivityIndicator size="large" className="mt-10" /> : <AdminTable columns={columns} rows={configs} rowKey={(r) => r.id} />}
      <AdminModal visible={modalVisible} title={editId ? "Edit Intro Config" : "Add Intro Config"} onClose={() => setModalVisible(false)}>
        <View className="gap-[10px]">
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Zone</Text>
            <View className="border border-goBorderLight dark:border-goBorderDark rounded-[8px] px-[10px] py-[8px]">
              {zones.map((z) => (
                <Pressable
                  key={z.id}
                  onPress={() => setForm({ ...form, zone_id: z.id })}
                  className={`py-2 ${form.zone_id === z.id ? 'bg-goAdminAccent' : ''}`}
                >
                  <Text className={`font-Jakarta text-[14px] ${form.zone_id === z.id ? 'text-goBgDark' : 'text-goTextPrimaryDark'}`}>{z.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Ride Number (1 = first ride)</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.ride_number} onChangeText={(v) => setForm({ ...form, ride_number: v })} keyboardType="numeric" />
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Discount %</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.discount_percent} onChangeText={(v) => setForm({ ...form, discount_percent: v })} keyboardType="numeric" />
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Max Discount (৳)</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.max_discount_bdt} onChangeText={(v) => setForm({ ...form, max_discount_bdt: v })} placeholder="Leave blank for unlimited" placeholderTextColor="#6B7280" keyboardType="numeric" />
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Daily Cap (৳)</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.daily_cap_bdt} onChangeText={(v) => setForm({ ...form, daily_cap_bdt: v })} keyboardType="numeric" />
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Effective From</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.effective_from} onChangeText={(v) => setForm({ ...form, effective_from: v })} placeholder="YYYY-MM-DDTHH:MM (blank = now)" placeholderTextColor="#6B7280" />
          </View>
          <View>
            <Text className="text-goTextSecondaryDark font-Jakarta text-[12px] mb-1">Effective To (৳)</Text>
            <TextInput className="bg-goDarkSecondary rounded-[8px] px-[10px] py-[8px] text-goTextPrimaryDark font-Jakarta text-[14px]"
              value={form.effective_to} onChangeText={(v) => setForm({ ...form, effective_to: v })} placeholder="Leave blank for no expiry" placeholderTextColor="#6B7280" />
          </View>
          <Pressable onPress={() => setForm({ ...form, is_active: !form.is_active })} className="flex-row items-center py-2">
            <View className={`w-5 h-5 rounded border-2 items-center justify-center mr-2 ${form.is_active ? 'bg-goPrimary border-goPrimary' : 'border-goBorderLight dark:border-goBorderDark'}`}>
              {form.is_active && <Text className="text-[10px] text-goWhite">✓</Text>}
            </View>
            <Text className="text-goTextPrimaryDark font-Jakarta text-[14px]">Active</Text>
          </Pressable>
          <Pressable onPress={save} style={styles.saveBtn}>
            <Text style={styles.saveText}>{editId ? "Update Config" : "Create Config"}</Text>
          </Pressable>
        </View>
      </AdminModal>
    </AdminShell>
  );
};

const styles = StyleSheet.create({
  editBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.primary, borderRadius: 4 },
  editText: { color: colors.bgLight, fontFamily: "Inter-Bold", fontSize: 11 },
  delBtn: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: colors.danger, borderRadius: 4 },
  delText: { color: colors.bgLight, fontFamily: "Inter-Bold", fontSize: 11 },
  addBtn: { padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignSelf: "flex-start", marginBottom: 12 },
  addText: { color: colors.bgLight, fontFamily: "Inter-Bold", fontSize: 13 },
  saveBtn: { padding: 12, backgroundColor: colors.primary, borderRadius: 8, alignItems: "center" },
  saveText: { color: colors.bgLight, fontFamily: "Inter-Bold", fontSize: 14 },
});

export default IntroConfigAdmin;
