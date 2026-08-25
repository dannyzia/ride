// F15-UI-XX Premium Allowlist Management
// Admin screen for managing brands/models that map to car_premium.
import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Alert,
  StatusBar,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, radii, spacing } from "@/theme/goRide";

interface AllowlistEntry {
  id: string;
  brand: string;
  model: string | null;
  is_active: boolean;
  created_at: string;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `HTTP ${res.status}`);
  }
  return res;
}

export default function PremiumAllowlistScreen() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter === "active") params.set("active", "true");
      if (filter === "inactive") params.set("active", "false");
      const res = await apiFetch(`/api/admin/premium-allowlist?${params.toString()}`);
      const data = await res.json();
      setEntries(data.allowlist ?? []);
    } catch (err) {
      logger.error("[admin/premium-allowlist] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void fetchEntries(); }, [fetchEntries]);

  const handleAdd = async () => {
    const b = brand.trim();
    if (!b) { Alert.alert("Error", "Brand is required"); return; }
    setAdding(true);
    try {
      await apiFetch("/api/admin/premium-allowlist", {
        method: "POST",
        body: JSON.stringify({
          brand: b,
          model: model.trim() || null,
        }),
      });
      setBrand("");
      setModel("");
      void fetchEntries();
    } catch (err) {
      Alert.alert("Error", String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleDeactivate = async (id: string, entryBrand: string, entryModel: string | null) => {
    Alert.alert(
      "Deactivate",
      `Remove ${entryBrand}${entryModel ? ` ${entryModel}` : ""} from premium allowlist?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            try {
              await apiFetch(`/api/admin/premium-allowlist/${id}`, { method: "DELETE" });
              void fetchEntries();
            } catch (err) {
              Alert.alert("Error", String(err));
            }
          },
        },
      ],
    );
  };

  const handleReactivate = async (id: string) => {
    try {
      await apiFetch(`/api/admin/premium-allowlist/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: true }),
      });
      void fetchEntries();
    } catch (err) {
      Alert.alert("Error", String(err));
    }
  };

  const renderItem = ({ item }: { item: AllowlistEntry }) => (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 15, color: colors.textPrimaryLight }}>
          {item.brand}
        </Text>
        <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 13, color: colors.textSecondaryLight, marginTop: 2 }}>
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
        <TouchableOpacity onPress={() => void handleDeactivate(item.id, item.brand, item.model)}>
          <Ionicons name="close-circle" size={22} color={colors.danger} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={() => void handleReactivate(item.id)}>
          <Ionicons name="refresh-circle" size={22} color={colors.success} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgLight }}>
      <StatusBar barStyle="light-content" backgroundColor={colors.darkSurface} />
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: colors.darkSurface,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontFamily: "Jakarta-Bold", fontSize: 17, color: colors.white }}>
          Premium Allowlist
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Add form */}
      <View style={{ padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.borderLight }}>
        <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 14, color: colors.textPrimaryLight, marginBottom: spacing.sm }}>
          Add Premium Brand/Model
        </Text>
        <TextInput
          placeholder="Brand (e.g. Toyota)"
          placeholderTextColor={colors.textSecondaryLight}
          value={brand}
          onChangeText={setBrand}
          style={{
            borderWidth: 1,
            borderColor: colors.borderLight,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
            color: colors.textPrimaryLight,
            marginBottom: spacing.sm,
          }}
        />
        <TextInput
          placeholder="Model (optional — empty = all models)"
          placeholderTextColor={colors.textSecondaryLight}
          value={model}
          onChangeText={setModel}
          style={{
            borderWidth: 1,
            borderColor: colors.borderLight,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            fontFamily: "Jakarta-Regular",
            fontSize: 14,
            color: colors.textPrimaryLight,
            marginBottom: spacing.sm,
          }}
        />
        <TouchableOpacity
          onPress={() => void handleAdd()}
          disabled={adding || !brand.trim()}
          style={{
            backgroundColor: adding || !brand.trim() ? colors.textDisabledLight : colors.primary,
            borderRadius: radii.pill,
            paddingVertical: spacing.sm,
            alignItems: "center",
          }}
        >
          {adding ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: colors.white }}>
              Add to Allowlist
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={{ flexDirection: "row", paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.sm }}>
        {(["active", "inactive", "all"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={{
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radii.pill,
              backgroundColor: filter === f ? colors.primary : colors.gray100,
            }}
          >
            <Text style={{ fontFamily: "Jakarta-SemiBold", fontSize: 12, color: filter === f ? colors.white : colors.textSecondaryLight }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : entries.length === 0 ? (
        <View style={{ alignItems: "center", marginTop: 40 }}>
          <Text style={{ fontFamily: "Jakarta-Regular", fontSize: 14, color: colors.textSecondaryLight }}>
            No entries found
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      )}
    </View>
  );
}
