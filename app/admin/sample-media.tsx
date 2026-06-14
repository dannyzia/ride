// F15-UI-11 Onboarding Sample Media
// Admin manages reference photos and the walkaround video shown to drivers
// during onboarding. All keys live in system_config as plain strings (URLs
// stored verbatim). The server allow-lists every sample_vehicle_* key.
//
// API:
//   GET   /api/admin/system-config  → { config: ConfigItem[] }
//   PATCH /api/admin/system-config  ← { updates: [{key, value}, ...] }
//                                    → { config: ConfigItem[] }
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { useAdminToast } from "@/components/admin/AdminToast";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ConfigItem {
  key: string;
  value: string;
  updated_at: string;
}

interface ConfigResponse {
  config?: ConfigItem[];
}

interface SampleDescriptor {
  key: string;
  label: string;
  kind: "photo" | "video";
}

// Ordered to match the onboarding flow (front → left → right → rear →
// interior → video). Server validates against this same set.
const SAMPLE_DESCRIPTORS: SampleDescriptor[] = [
  { key: "sample_vehicle_photo_front", label: "Front Photo", kind: "photo" },
  { key: "sample_vehicle_photo_left", label: "Left Photo", kind: "photo" },
  { key: "sample_vehicle_photo_right", label: "Right Photo", kind: "photo" },
  { key: "sample_vehicle_photo_rear", label: "Rear Photo", kind: "photo" },
  {
    key: "sample_vehicle_photo_dashboard",
    label: "Dashboard Photo",
    kind: "photo",
  },
  { key: "sample_vehicle_photo_seats", label: "Seats Photo", kind: "photo" },
  { key: "sample_vehicle_video", label: "Walkaround Video", kind: "video" },
];

const SAMPLE_PREFIX = "sample_vehicle_";

export default function SampleMediaScreen() {
  const toast = useAdminToast();
  const [serverValues, setServerValues] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/system-config",
      { method: "GET" },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(
          `Failed to load sample media: ${error ?? "unknown"}`,
          "error",
        );
      }
      setServerValues({});
      setEdits({});
    } else {
      const map: Record<string, string> = {};
      for (const row of data.config ?? []) {
        if (row.key.startsWith(SAMPLE_PREFIX)) map[row.key] = row.value;
      }
      setServerValues(map);
      // Seed the edit buffer so cards without a DB row render as empty.
      const seed: Record<string, string> = {};
      for (const d of SAMPLE_DESCRIPTORS) seed[d.key] = map[d.key] ?? "";
      setEdits(seed);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const dirtyKeys = useMemo(
    () =>
      SAMPLE_DESCRIPTORS.filter(
        (d) => (edits[d.key] ?? "") !== (serverValues[d.key] ?? ""),
      ).map((d) => d.key),
    [edits, serverValues],
  );

  const hasChanges = dirtyKeys.length > 0;

  const handleSaveAll = async () => {
    if (!hasChanges) {
      toast.show("No changes to save", "info");
      return;
    }
    setSaving(true);
    const updates = dirtyKeys.map((k) => ({ key: k, value: edits[k] ?? "" }));
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/system-config",
      { method: "PATCH", body: JSON.stringify({ updates }) },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Save failed: ${error ?? "unknown"}`, "error");
      } else {
        toast.show("Save failed: network error", "error");
      }
      setSaving(false);
      return;
    }
    const map: Record<string, string> = {};
    for (const row of data.config ?? []) {
      if (row.key.startsWith(SAMPLE_PREFIX)) map[row.key] = row.value;
    }
    setServerValues(map);
    const seed: Record<string, string> = {};
    for (const d of SAMPLE_DESCRIPTORS) seed[d.key] = map[d.key] ?? "";
    setEdits(seed);
    toast.show(
      `Saved ${updates.length} item${updates.length === 1 ? "" : "s"}`,
      "success",
    );
    setSaving(false);
  };

  const openUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;
    // Web-only DOM API. Guarded at call site with disabled button.
    window.open(trimmed, "_blank", "noopener,noreferrer");
  };

  return (
    <AdminShell
      title="Onboarding Sample Media"
      subtitle="Reference photos and video shown to drivers during onboarding"
      actions={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={styles.ghostBtn}
            onPress={fetchConfig}
            disabled={saving}
          >
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable
            style={[
              styles.primaryBtn,
              (!hasChanges || saving) && styles.primaryBtnDisabled,
            ]}
            onPress={handleSaveAll}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Save All</Text>
            )}
          </Pressable>
        </View>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={styles.grid}>
          {SAMPLE_DESCRIPTORS.map((d) => {
            const url = (edits[d.key] ?? "").trim();
            const serverUrl = (serverValues[d.key] ?? "").trim();
            const dirty = url !== serverUrl;
            return (
              <View key={d.key} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{d.label}</Text>
                    <Text style={styles.cardKey}>{d.key}</Text>
                  </View>
                  {dirty ? (
                    <Text style={styles.dirtyBadge}>Modified</Text>
                  ) : null}
                </View>

                <View style={styles.previewBox}>
                  {url ? (
                    d.kind === "video" ? (
                      <video src={url} controls style={PREVIEW_MEDIA_STYLE} />
                    ) : (
                      <img
                        src={url}
                        alt={d.label}
                        style={PREVIEW_MEDIA_STYLE}
                      />
                    )
                  ) : (
                    <Text style={styles.previewEmpty}>Not configured</Text>
                  )}
                </View>

                <Text style={styles.fieldLabel}>URL</Text>
                <TextInput
                  style={styles.input}
                  value={edits[d.key] ?? ""}
                  onChangeText={(v) =>
                    setEdits((prev) => ({ ...prev, [d.key]: v }))
                  }
                  placeholder="https://..."
                  placeholderTextColor={colors.textDisabledDark}
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.cardActions}>
                  <Pressable
                    style={[styles.miniBtn, !url && styles.miniBtnDisabled]}
                    onPress={() => openUrl(url)}
                    disabled={!url}
                  >
                    <Text style={styles.miniBtnText}>Open</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </AdminShell>
  );
}

// Style for the inline <img>/<video> DOM elements (web only). Kept as a plain
// object rather than going through RN's StyleSheet.create so the DOM-only
// CSS property `objectFit` does not collide with RN's type definitions.
const PREVIEW_MEDIA_STYLE: Record<string, string | number> = {
  width: "100%",
  height: "100%",
  maxHeight: 180,
  objectFit: "cover",
  display: "block",
};

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-start",
  },
  card: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 16,
    width: 360,
    maxWidth: "100%",
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
  cardKey: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  dirtyBadge: {
    color: colors.amber,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  previewBox: {
    width: "100%",
    height: 180,
    backgroundColor: "#101216",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  previewEmpty: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  cardActions: {
    flexDirection: "row",
    gap: 8,
  },
  miniBtn: {
    backgroundColor: "#2A2D35",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6,
  },
  miniBtnDisabled: { opacity: 0.4 },
  miniBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
  ghostBtn: {
    backgroundColor: colors.darkSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  ghostBtnText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  primaryBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
});
