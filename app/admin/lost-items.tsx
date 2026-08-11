import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminModal } from "@/components/admin/AdminModal";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

const STATUS_COLORS: Record<string, string> = { reported: colors.amber, driver_confirmed: colors.primary, arranged_return: colors.greenVariant, resolved: colors.checkGreen, unresolved: colors.danger };

export default function AdminLostItems() {
  const toast = useAdminToast();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await adminFetch<{ items: any[] }>("/api/admin/lost-items");
    if (res.data) setItems(res.data.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const mediate = async (itemId: string) => {
    const res = await adminFetch(`/api/admin/lost-items`, {
      method: "PATCH", body: JSON.stringify({ item_id: itemId, admin_mediation: true }), headers: { "Content-Type": "application/json" },
    });
    if (res.data) { toast.show("Mediated", "success"); setSelected(null); fetchItems(); }
    else { toast.show(res.error ?? "Failed", "error"); }
  };

  return (
    <AdminShell title="Lost Items" subtitle="All rider lost item reports">
      {loading ? <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} /> : (
        <FlatList data={items} keyExtractor={(r: any) => r.id}
          ListEmptyComponent={<Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", textAlign: "center", marginTop: 40 }}>No lost item reports</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => setSelected(item)} style={styles.card}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={styles.desc} numberOfLines={1}>{item.item_description}</Text>
                <Text style={[styles.status, { color: STATUS_COLORS[item.status] ?? colors.textSecondaryDark }]}>{item.status.replace(/_/g, " ")}</Text>
              </View>
              <Text style={styles.meta}>Rider: {item.rider_id?.slice(0, 8)} | Driver: {item.driver_id?.slice(0, 8)}</Text>
              {item.admin_mediation && <Text style={styles.mediation}>⚖️ Mediated</Text>}
            </Pressable>
          )}
        />
      )}
      <AdminModal visible={!!selected} title={selected?.item_description ?? ""} onClose={() => setSelected(null)}>
        <Text style={styles.label}>Status: {selected?.status}</Text>
        <Text style={styles.label}>Rider ID: {selected?.rider_id}</Text>
        <Text style={styles.label}>Driver ID: {selected?.driver_id}</Text>
        {selected?.driver_response && <Text style={styles.label}>Driver: {selected.driver_response}</Text>}
        {selected?.return_fee_bdt > 0 && <Text style={styles.label}>Fee: ৳{((selected?.return_fee_bdt ?? 0) / 100).toFixed(0)}</Text>}
        {!selected?.admin_mediation && (
          <Pressable onPress={() => mediate(selected.id)} style={styles.actionBtn}><Text style={styles.actionText}>⚖️ Mark Mediated</Text></Pressable>
        )}
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.darkSecondary, padding: 12, marginBottom: 6, borderRadius: 8 },
  desc: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Bold", fontSize: 13, flex: 1 },
  status: { fontFamily: "Jakarta-Bold", fontSize: 11 },
  meta: { color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11, marginTop: 4 },
  mediation: { color: colors.amber, fontFamily: "Jakarta-Bold", fontSize: 11, marginTop: 2 },
  label: { color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 13, marginBottom: 4 },
  actionBtn: { marginTop: 12, backgroundColor: colors.adminAccent, padding: 12, borderRadius: 8, alignItems: "center" },
  actionText: { color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 },
});
