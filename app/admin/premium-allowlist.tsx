// F15-UI-XX Premium Allowlist Management
// Admin screen for managing brands/models that map to car_premium.
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors, radii, spacing } from "@/theme/goRide";

interface AllowlistEntry {
  id: string;
  brand: string;
  model: string | null;
  is_active: boolean;
  created_at: string;
}

export default function PremiumAllowlistScreen() {
  const toast = useAdminToast();
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter === "active") params.set("active", "true");
    if (filter === "inactive") params.set("active", "false");
    const res = await adminFetch<{ allowlist: AllowlistEntry[] }>(
      `/api/admin/premium-allowlist?${params.toString()}`,
    );
    if (res.error) toast.show(res.message ?? res.error, "error");
    else setEntries(res.data?.allowlist ?? []);
    setLoading(false);
  }, [filter, toast]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  const handleAdd = async () => {
    const b = brand.trim();
    if (!b) {
      toast.show("Brand is required", "error");
      return;
    }
    setAdding(true);
    const res = await adminFetch("/api/admin/premium-allowlist", {
      method: "POST",
      body: JSON.stringify({ brand: b, model: model.trim() || null }),
    });
    if (res.error) {
      toast.show(res.message ?? res.error, "error");
    } else {
      toast.show("Added to allowlist", "success");
      setBrand("");
      setModel("");
      void fetchEntries();
    }
    setAdding(false);
  };

  const handleDeactivate = (id: string, entryBrand: string, entryModel: string | null) => {
    Alert.alert(
      "Deactivate",
      `Remove ${entryBrand}${entryModel ? ` ${entryModel}` : ""} from premium allowlist?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            const res = await adminFetch(`/api/admin/premium-allowlist/${id}`, { method: "DELETE" });
            if (res.error) toast.show(res.message ?? res.error, "error");
            else {
              toast.show("Deactivated", "success");
              void fetchEntries();
            }
          },
        },
      ],
    );
  };

  const handleReactivate = async (id: string) => {
    const res = await adminFetch(`/api/admin/premium-allowlist/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_active: true }),
    });
    if (res.error) toast.show(res.message ?? res.error, "error");
    else {
      toast.show("Reactivated", "success");
      void fetchEntries();
    }
  };

  const renderItem = ({ item }: { item: AllowlistEntry }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderDark,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 15, color: colors.textPrimaryDark }}>
          {item.brand}
        </Text>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: colors.textSecondaryDark, marginTop: 2 }}>
          {item.model ?? "All models (brand-wide)"}
        </Text>
      </View>
      <View
        style={{
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderRadius: radii.xs,
          backgroundColor: item.is_active ? colors.success + "20" : colors.grayMedium + "20",
          marginRight: spacing.md,
        }}
      >
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 11, color: item.is_active ? colors.success : colors.grayMedium }}>
          {item.is_active ? "Active" : "Inactive"}
        </Text>
      </View>
      {item.is_active ? (
        <Pressable onPress={() => handleDeactivate(item.id, item.brand, item.model)} testID="admin.premium-allowlist.handle-deactivate">
          <Text style={{ color: colors.danger, fontFamily: "Jakarta-Bold", fontSize: 12 }}>Deactivate</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => void handleReactivate(item.id)} testID="admin.premium-allowlist.handle-reactivate">
          <Text style={{ color: colors.success, fontFamily: "Jakarta-Bold", fontSize: 12 }}>Reactivate</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <AdminShell title="Premium Allowlist" subtitle="Brands/models that map to car_premium">
      <View style={{ marginBottom: spacing.md }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: colors.textPrimaryDark, marginBottom: spacing.sm }}>
          Add Premium Brand/Model
        </Text>
        <TextInput
          placeholder="Brand (e.g. Toyota)"
          placeholderTextColor={colors.textSecondaryDark}
          value={brand}
          onChangeText={setBrand}
          style={{
            backgroundColor: colors.darkSecondary,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
            color: colors.textPrimaryDark,
            marginBottom: spacing.sm,
          }}
         
         testID="admin.premium-allowlist.set-brand"/>
        <TextInput
          placeholder="Model (optional — empty = all models)"
          placeholderTextColor={colors.textSecondaryDark}
          value={model}
          onChangeText={setModel}
          style={{
            backgroundColor: colors.darkSecondary,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
            color: colors.textPrimaryDark,
            marginBottom: spacing.sm,
          }}
         
         testID="admin.premium-allowlist.set-model"/>
        <Pressable
          onPress={() => void handleAdd()}
          disabled={adding || !brand.trim()}
          style={{
            backgroundColor: adding || !brand.trim() ? colors.darkSurface : colors.primary,
            borderRadius: radii.pill,
            paddingVertical: spacing.sm,
            alignItems: "center",
          }}
         
         testID="admin.premium-allowlist.handle-add">
          {adding ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: colors.white }}>
              Add to Allowlist
            </Text>
          )}
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", paddingBottom: spacing.md, gap: spacing.sm }}>
        {(["active", "inactive", "all"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radii.pill,
              backgroundColor: filter === f ? colors.primary : colors.darkSecondary,
            }}
           
           testID="admin.premium-allowlist.set-filter">
            <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 12, color: filter === f ? colors.white : colors.textSecondaryDark }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 40 }}>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: colors.textSecondaryDark }}>
            No entries found
          </Text>
        </View>
      ) : (
        <FlatList data={entries} keyExtractor={(item) => item.id} renderItem={renderItem} />
      )}
    </AdminShell>
  );
}
