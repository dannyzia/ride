import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

export default function SurgeConfig() {
  const toast = useAdminToast();
  const [thresholds, setThresholds] = useState<{ ratio: number; multiplier: number }[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [fetchError, setFetchError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    const cfg = await adminFetch<{ config: { key: string; value: string }[] }>("/api/admin/system-config");
    if (!cfg.data || cfg.error) {
      setFetchError(cfg.error ?? "Failed to load surge config");
      setLoading(false);
      return;
    }
    const row = cfg.data.config?.find((r) => r.key === "surge_thresholds");
    if (row) {
      try {
        const parsed = JSON.parse(row.value);
        if (!Array.isArray(parsed)) {
          setFetchError("Surge config in database is corrupt (not an array). Contact developer.");
          setLoading(false);
          return;
        }
        setThresholds(parsed);
      } catch {
        setFetchError("Surge config in database is invalid JSON. Contact developer.");
        setLoading(false);
        return;
      }
    } else {
      setThresholds([{ ratio: 3, multiplier: 2.0 }, { ratio: 2, multiplier: 1.5 }, { ratio: 1.2, multiplier: 1.25 }]);
    }
    const hist = await adminFetch<{ history: any[] }>("/api/admin/surge-history");
    if (hist.data) setHistory(hist.data.history ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async () => {
    setSaveError("");
    for (const t of thresholds) {
      if (t.ratio <= 0) { setSaveError("All ratios must be > 0"); return; }
      if (t.multiplier < 1.0) { setSaveError("All multipliers must be >= 1.0"); return; }
    }
    const res = await adminFetch<{ config: any[] }>("/api/admin/system-config", {
      method: "PATCH", body: JSON.stringify({ updates: [{ key: "surge_thresholds", value: JSON.stringify(thresholds) }] }), headers: { "Content-Type": "application/json" },
    });
    if (res.data?.config) toast.show("Saved", "success");
    else toast.show(res.error ?? "Failed", "error");
  };

  const updateThreshold = (i: number, field: "ratio" | "multiplier", val: string) => {
    const parsed = parseFloat(val);
    if (Number.isNaN(parsed)) return;
    const updated = [...thresholds];
    updated[i] = { ...updated[i], [field]: parsed };
    setThresholds(updated);
  };

  return (
    <AdminShell title="Surge Config" subtitle="Configure surge pricing thresholds">
      {loading ? (
        <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
      ) : fetchError ? (
        <Text style={{ color: colors.danger, fontFamily: "Jakarta-Regular", fontSize: 14 }}>{fetchError}</Text>
      ) : (
        <>
          <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Bold", fontSize: 14, marginBottom: 8 }}>Thresholds (ratio → multiplier)</Text>
          {thresholds.map((t, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular" }}>Ratio &gt;</Text>
              <View style={{ flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 6, padding: 6 }}>
                <input type="number" value={String(t.ratio)} onChange={(e) => updateThreshold(i, "ratio", e.target.value)}
                  style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }} />
              </View>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular" }}>→ ×</Text>
              <View style={{ flex: 1, backgroundColor: colors.darkSecondary, borderRadius: 6, padding: 6 }}>
                <input type="number" step="0.25" value={String(t.multiplier)} onChange={(e) => updateThreshold(i, "multiplier", e.target.value)}
                  style={{ background: "transparent", color: colors.textPrimaryDark, border: "none", outline: "none", width: "100%", fontFamily: "Jakarta-Regular", fontSize: 14 }} />
              </View>
              <Pressable onPress={() => setThresholds(thresholds.filter((_, j) => j !== i))} style={{ padding: 6 }}>
                <Text style={{ color: colors.danger, fontFamily: "Jakarta-Bold" }}>×</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={() => setThresholds([...thresholds, { ratio: 1, multiplier: 1.25 }])}
            style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.darkSecondary, borderRadius: 6, alignSelf: "flex-start", marginBottom: 12 }}>
            <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 12 }}>+ Add tier</Text>
          </Pressable>
          {saveError ? <Text style={{ color: colors.danger, fontFamily: "Jakarta-Regular", fontSize: 12, marginBottom: 8 }}>{saveError}</Text> : null}
          <Pressable onPress={save} style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.adminAccent, borderRadius: 8, alignSelf: "flex-start", marginBottom: 24 }}>
            <Text style={{ color: "#000", fontFamily: "Jakarta-Bold", fontSize: 13 }}>Save</Text>
          </Pressable>
          <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Bold", fontSize: 14, marginBottom: 8 }}>Surge History</Text>
          {history.map((h: any) => (
            <View key={h.id} style={{ flexDirection: "row", padding: 8, backgroundColor: colors.darkSecondary, borderRadius: 6, marginBottom: 4 }}>
              <Text style={{ color: colors.textPrimaryDark, fontFamily: "Jakarta-Regular", fontSize: 11, flex: 1 }}>{new Date(h.triggered_at).toLocaleString()}</Text>
              <Text style={{ color: colors.amber, fontFamily: "Jakarta-Bold", fontSize: 11, marginRight: 8 }}>×{h.multiplier}</Text>
              <Text style={{ color: colors.textSecondaryDark, fontFamily: "Jakarta-Regular", fontSize: 11 }}>D:{h.demand_count} S:{h.supply_count}</Text>
            </View>
          ))}
        </>
      )}
    </AdminShell>
  );
}
