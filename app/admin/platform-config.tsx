// F15-UI-12 Platform Configuration
// Consolidates three operational surfaces into a single screen:
//   1. Dispatch Control  — hot pause/resume toggle (POST /dispatch-toggle).
//   2. Platform Policy   — knobs in platform_config (PATCH /config).
//   3. Operational Toggles — non-dispatch keys in system_config (PATCH /system-config).
//
// This screen REPLACES the legacy configuration.tsx (which only exposed the
// 5 platform_config keys). That file is removed in a separate cleanup.
//
// Money convention: BRTA *_bdt keys are stored as integer paisa in the DB.
// Display in taka (÷100), multiply by 100 when sending back.
// system_config values are all strings — convert numbers to string on save,
// parse to number on load.
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
import { AdminModal } from "@/components/admin/AdminModal";
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

interface DispatchToggleResponse {
  dispatch_paused?: boolean;
}

// ----- Section 2: Platform Policy (platform_config) -----
type PolicyType = "ratio" | "moneyTaka";
interface PolicyField {
  key: string;
  label: string;
  helpText: string;
  type: PolicyType;
}
// All platform_config keys are numeric strings on the wire. Money keys store
// integer paisa in the DB but are edited/displayed in taka on this screen.
const POLICY_FIELDS: PolicyField[] = [
  {
    key: "driver_min_ratio",
    label: "Driver Min Ratio",
    helpText:
      "Min multiplier of the system rate a driver can set (0.10 – 5.00).",
    type: "ratio",
  },
  {
    key: "driver_max_ratio",
    label: "Driver Max Ratio",
    helpText:
      "Max multiplier of the system rate a driver can set (0.10 – 5.00).",
    type: "ratio",
  },
  {
    key: "brta_max_base_bdt",
    label: "BRTA Max Base Fare (৳)",
    helpText: "Ceiling on the base fare. Stored as paisa; shown in taka.",
    type: "moneyTaka",
  },
  {
    key: "brta_max_per_km_bdt",
    label: "BRTA Max Per-Km Fare (৳)",
    helpText: "Ceiling on the per-km charge. Stored as paisa; shown in taka.",
    type: "moneyTaka",
  },
  {
    key: "brta_max_wait_per_2min_bdt",
    label: "BRTA Max Wait / 2min (৳)",
    helpText:
      "Ceiling on wait-time charge per 2 min. Stored as paisa; shown in taka.",
    type: "moneyTaka",
  },
];

// ----- Section 3: Operational Toggles (system_config) -----
type OpType = "text" | "integer" | "score0_100" | "moneyTaka";
interface OpField {
  key: string;
  label: string;
  helpText: string;
  type: OpType;
}
const OP_FIELDS: OpField[] = [
  {
    key: "sos_police_number",
    label: "SOS Police Number",
    helpText: "Phone number dialled when rider triggers SOS for police help.",
    type: "text",
  },
  {
    key: "sos_ride_number",
    label: "SOS Ride Support Number",
    helpText: "Phone number dialled when rider triggers in-ride SOS.",
    type: "text",
  },
  {
    key: "face_match_min_score",
    label: "Face Match Min Score",
    helpText: "Selfie-vs-ID similarity threshold (0 – 100).",
    type: "score0_100",
  },
  {
    key: "min_app_version",
    label: "Min App Version",
    helpText: "Below this version the client hard-blocks login.",
    type: "text",
  },
  {
    key: "latest_version",
    label: "Latest App Version",
    helpText: "Newest shipped version surfaced for update prompts.",
    type: "text",
  },
  {
    key: "apk_download_url",
    label: "APK Download URL",
    helpText: "Direct APK URL used by sideload update flow.",
    type: "text",
  },
  {
    key: "brta_fare_ceiling_bdt",
    label: "BRTA Fare Ceiling (৳)",
    helpText:
      "Hard cap on computed total fare. Stored as paisa; shown in taka.",
    type: "moneyTaka",
  },
  {
    key: "max_free_wait_seconds",
    label: "Max Free Wait (seconds)",
    helpText: "Grace period a driver waits before wait-time charges begin.",
    type: "integer",
  },
  {
    key: "stale_arrived_timeout_minutes",
    label: "Stale 'Arrived' Timeout (minutes)",
    helpText: "Driver auto-cancels from 'arrived' after this idle duration.",
    type: "integer",
  },
  {
    key: "geofence_arrival_radius_meters",
    label: "Geofence Arrival Radius (m)",
    helpText:
      "Distance from pickup within which a driver is considered arrived.",
    type: "integer",
  },
  {
    key: "geofence_arrival_dwell_seconds",
    label: "Geofence Arrival Dwell (seconds)",
    helpText: "Time a driver must remain inside the radius to confirm arrival.",
    type: "integer",
  },
];

// system_config keys consumed elsewhere — never edit on this screen.
const EXCLUDED_SYSTEM_KEYS = new Set([
  "dispatch_paused",
  "sos_contacts", // managed on a different screen
  "sample_vehicle_photo_front",
  "sample_vehicle_photo_left",
  "sample_vehicle_photo_right",
  "sample_vehicle_photo_rear",
  "sample_vehicle_photo_dashboard",
  "sample_vehicle_photo_seats",
  "sample_vehicle_video",
]);

// ----- Field-level helpers -----
function parseDisplayNumber(value: string | undefined, scale: number): string {
  if (value === undefined || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  // Show money in taka; ratios and unitless numbers pass through.
  return scale === 1 ? String(n) : String(n / scale);
}

function serializeNumber(displayed: string, scale: number): string | null {
  const n = Number(displayed);
  if (!Number.isFinite(n)) return null;
  const scaled = scale === 1 ? n : Math.round(n * scale);
  return String(scaled);
}

export default function PlatformConfigScreen() {
  const toast = useAdminToast();

  const [dispatchPaused, setDispatchPaused] = useState(false);
  const [dispatchLoaded, setDispatchLoaded] = useState(false);
  const [togglingDispatch, setTogglingDispatch] = useState(false);
  const [confirmPause, setConfirmPause] = useState<null | boolean>(null);

  // serverValues holds the raw DB strings; edits holds the user-facing
  // display value (already scaled for money fields).
  const [policyServer, setPolicyServer] = useState<Record<string, string>>({});
  const [policyEdits, setPolicyEdits] = useState<Record<string, string>>({});
  const [savingPolicy, setSavingPolicy] = useState(false);

  const [opServer, setOpServer] = useState<Record<string, string>>({});
  const [opEdits, setOpEdits] = useState<Record<string, string>>({});
  const [opAvailableKeys, setOpAvailableKeys] = useState<Set<string>>(
    new Set(),
  );
  const [savingOp, setSavingOp] = useState(false);

  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [systemRes, policyRes] = await Promise.all([
      adminFetch<ConfigResponse>("/api/admin/system-config", { method: "GET" }),
      adminFetch<ConfigResponse>("/api/admin/config", { method: "GET" }),
    ]);

    // Dispatch state lives in system_config as "true"/"false".
    if (systemRes.error || !systemRes.data) {
      if (systemRes.status !== 0) {
        toast.show(
          `Failed to load system config: ${systemRes.error ?? "unknown"}`,
          "error",
        );
      }
      setDispatchPaused(false);
      setDispatchLoaded(true);
      setOpServer({});
      setOpEdits({});
      setOpAvailableKeys(new Set());
    } else {
      const rows = systemRes.data.config ?? [];
      const pausedRow = rows.find((r) => r.key === "dispatch_paused");
      setDispatchPaused(pausedRow ? pausedRow.value === "true" : false);
      setDispatchLoaded(true);

      const opMap: Record<string, string> = {};
      const available: Set<string> = new Set();
      for (const r of rows) {
        if (EXCLUDED_SYSTEM_KEYS.has(r.key)) continue;
        if (!OP_FIELDS.some((f) => f.key === r.key)) continue;
        opMap[r.key] = r.value;
        available.add(r.key);
      }
      setOpServer(opMap);
      setOpAvailableKeys(available);
      const opEditsMap: Record<string, string> = {};
      for (const f of OP_FIELDS) {
        if (available.has(f.key)) {
          // Text fields (e.g. min_app_version = "1.0.0") must pass through
          // untouched — parseDisplayNumber would coerce them via Number()
          // and return "" for non-numeric strings like semver.
          if (f.type === "text") {
            opEditsMap[f.key] = opMap[f.key];
          } else {
            const scale = f.type === "moneyTaka" ? 100 : 1;
            opEditsMap[f.key] = parseDisplayNumber(opMap[f.key], scale);
          }
        }
      }
      setOpEdits(opEditsMap);
    }

    if (policyRes.error || !policyRes.data) {
      if (policyRes.status !== 0) {
        toast.show(
          `Failed to load platform policy: ${policyRes.error ?? "unknown"}`,
          "error",
        );
      }
      setPolicyServer({});
      setPolicyEdits({});
    } else {
      const map: Record<string, string> = {};
      for (const r of policyRes.data.config ?? []) {
        if (POLICY_FIELDS.some((f) => f.key === r.key)) map[r.key] = r.value;
      }
      setPolicyServer(map);
      const editsMap: Record<string, string> = {};
      for (const f of POLICY_FIELDS) {
        if (map[f.key] !== undefined) {
          const scale = f.type === "moneyTaka" ? 100 : 1;
          editsMap[f.key] = parseDisplayNumber(map[f.key], scale);
        }
      }
      setPolicyEdits(editsMap);
    }

    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ----- Dispatch Control -----
  const handleConfirmToggle = async () => {
    const nextPaused = confirmPause;
    if (nextPaused === null) return;
    setConfirmPause(null);
    setTogglingDispatch(true);
    const { data, error, status } = await adminFetch<DispatchToggleResponse>(
      "/api/admin/dispatch-toggle",
      {
        method: "POST",
        body: JSON.stringify({ paused: nextPaused }),
      },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Toggle failed: ${error ?? "unknown"}`, "error");
      } else {
        toast.show("Toggle failed: network error", "error");
      }
      setTogglingDispatch(false);
      return;
    }
    setDispatchPaused(data.dispatch_paused ?? nextPaused);
    toast.show(
      (data.dispatch_paused ?? nextPaused)
        ? "Dispatch paused — no new rides will be matched"
        : "Dispatch resumed",
      (data.dispatch_paused ?? nextPaused) ? "warning" : "success",
    );
    setTogglingDispatch(false);
  };

  // ----- Policy save (Section 2) -----
  const policyDirtyKeys = useMemo(
    () =>
      new Set(
        POLICY_FIELDS.filter((f) => {
          if (policyServer[f.key] === undefined) return false;
          const scale = f.type === "moneyTaka" ? 100 : 1;
          const current = serializeNumber(policyEdits[f.key] ?? "", scale);
          return current !== policyServer[f.key];
        }).map((f) => f.key),
      ),
    [policyEdits, policyServer],
  );

  const policyHasChanges = policyDirtyKeys.size > 0;

  const handleSavePolicy = async () => {
    if (!policyHasChanges) {
      toast.show("No policy changes to save", "info");
      return;
    }
    // Pre-validate before the round-trip so the user gets actionable messages.
    const updates: { key: string; value: string }[] = [];
    for (const f of POLICY_FIELDS) {
      if (!policyDirtyKeys.has(f.key)) continue;
      const scale = f.type === "moneyTaka" ? 100 : 1;
      const serialized = serializeNumber(policyEdits[f.key] ?? "", scale);
      if (serialized === null) {
        toast.show(`${f.label} must be a number`, "error");
        return;
      }
      if (f.type === "ratio") {
        const n = Number(serialized);
        if (n < 0.1 || n > 5.0) {
          toast.show(`${f.label} must be between 0.10 and 5.00`, "error");
          return;
        }
      }
      if (f.type === "moneyTaka") {
        const n = Number(serialized);
        if (!Number.isInteger(n) || n < 0) {
          toast.show(
            `${f.label} must resolve to a whole paisa amount`,
            "error",
          );
          return;
        }
      }
      updates.push({ key: f.key, value: serialized });
    }
    if (updates.length === 0) return;

    setSavingPolicy(true);
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/config",
      { method: "PATCH", body: JSON.stringify({ updates }) },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Save failed: ${error ?? "unknown"}`, "error");
      } else {
        toast.show("Save failed: network error", "error");
      }
      setSavingPolicy(false);
      return;
    }
    const map: Record<string, string> = {};
    for (const r of data.config ?? []) {
      if (POLICY_FIELDS.some((f) => f.key === r.key)) map[r.key] = r.value;
    }
    setPolicyServer(map);
    const editsMap: Record<string, string> = {};
    for (const f of POLICY_FIELDS) {
      if (map[f.key] !== undefined) {
        const scale = f.type === "moneyTaka" ? 100 : 1;
        editsMap[f.key] = parseDisplayNumber(map[f.key], scale);
      }
    }
    setPolicyEdits(editsMap);
    toast.show("Platform policy saved", "success");
    setSavingPolicy(false);
  };

  // ----- Op save (Section 3) -----
  const opDirtyKeys = useMemo(
    () =>
      new Set(
        OP_FIELDS.filter((f) => {
          if (!opAvailableKeys.has(f.key)) return false;
          const scale = f.type === "moneyTaka" ? 100 : 1;
          const current = serializeNumber(
            opEdits[f.key] ?? "",
            f.type === "text" ? 1 : scale,
          );
          if (f.type === "text") {
            return (opEdits[f.key] ?? "") !== (opServer[f.key] ?? "");
          }
          return current !== opServer[f.key];
        }).map((f) => f.key),
      ),
    [opAvailableKeys, opEdits, opServer],
  );

  const opHasChanges = opDirtyKeys.size > 0;

  const handleSaveOp = async () => {
    if (!opHasChanges) {
      toast.show("No operational changes to save", "info");
      return;
    }
    const updates: { key: string; value: string }[] = [];
    for (const f of OP_FIELDS) {
      if (!opDirtyKeys.has(f.key)) continue;
      if (f.type === "text") {
        updates.push({ key: f.key, value: opEdits[f.key] ?? "" });
        continue;
      }
      const scale = f.type === "moneyTaka" ? 100 : 1;
      const serialized = serializeNumber(opEdits[f.key] ?? "", scale);
      if (serialized === null) {
        toast.show(`${f.label} must be a number`, "error");
        return;
      }
      const n = Number(serialized);
      if (f.type === "score0_100" && (n < 0 || n > 100)) {
        toast.show(`${f.label} must be between 0 and 100`, "error");
        return;
      }
      if (f.type === "moneyTaka" && (!Number.isInteger(n) || n < 0)) {
        toast.show(`${f.label} must resolve to a whole paisa amount`, "error");
        return;
      }
      if (
        (f.type === "integer" || f.type === "score0_100") &&
        (!Number.isInteger(n) || n < 0)
      ) {
        toast.show(`${f.label} must be a non-negative integer`, "error");
        return;
      }
      updates.push({ key: f.key, value: serialized });
    }
    if (updates.length === 0) return;

    setSavingOp(true);
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
      setSavingOp(false);
      return;
    }
    const rows = data.config ?? [];
    const opMap: Record<string, string> = {};
    const available: Set<string> = new Set();
    for (const r of rows) {
      if (EXCLUDED_SYSTEM_KEYS.has(r.key)) continue;
      if (!OP_FIELDS.some((f) => f.key === r.key)) continue;
      opMap[r.key] = r.value;
      available.add(r.key);
    }
    setOpServer(opMap);
    setOpAvailableKeys(available);
    const editsMap: Record<string, string> = {};
    for (const f of OP_FIELDS) {
      if (available.has(f.key)) {
        if (f.type === "text") {
          editsMap[f.key] = opMap[f.key];
        } else {
          const scale = f.type === "moneyTaka" ? 100 : 1;
          editsMap[f.key] = parseDisplayNumber(opMap[f.key], scale);
        }
      }
    }
    setOpEdits(editsMap);
    toast.show("Operational toggles saved", "success");
    setSavingOp(false);
  };

  return (
    <AdminShell
      title="Platform Configuration"
      subtitle="Global platform policy knobs and operational toggles"
      actions={
        <Pressable
          style={[styles.ghostBtn, loading && styles.ghostBtnDisabled]}
          onPress={fetchAll}
          disabled={loading}
        >
          <Text style={styles.ghostBtnText}>Refresh</Text>
        </Pressable>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* ---------- Section 1: Dispatch Control ---------- */}
          <View
            style={[
              styles.dispatchBanner,
              dispatchPaused ? styles.dispatchPaused : styles.dispatchRunning,
            ]}
          >
            <Text style={styles.dispatchBannerText}>
              {dispatchLoaded
                ? dispatchPaused
                  ? "⚠ DISPATCH PAUSED — no new rides being matched"
                  : "● Dispatch RUNNING"
                : "Loading dispatch state…"}
            </Text>
            <Pressable
              style={[
                styles.dispatchBtn,
                dispatchPaused
                  ? styles.dispatchResumeBtn
                  : styles.dispatchPauseBtn,
                togglingDispatch && styles.btnDisabled,
              ]}
              onPress={() => setConfirmPause(!dispatchPaused)}
              disabled={togglingDispatch || !dispatchLoaded}
            >
              {togglingDispatch ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.dispatchBtnText}>
                  {dispatchPaused ? "Resume dispatch" : "Pause dispatch"}
                </Text>
              )}
            </Pressable>
          </View>

          {/* ---------- Section 2: Platform Policy Knobs ---------- */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Platform Policy Knobs</Text>
                <Text style={styles.sectionSubtitle}>
                  Driver ratio bounds and BRTA fare ceilings (platform_config).
                </Text>
              </View>
              <Pressable
                style={[
                  styles.saveBtn,
                  (!policyHasChanges || savingPolicy) && styles.btnDisabled,
                ]}
                onPress={handleSavePolicy}
                disabled={!policyHasChanges || savingPolicy}
              >
                {savingPolicy ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
            {POLICY_FIELDS.length === 0 ? (
              <Text style={styles.emptyText}>No policy keys configured.</Text>
            ) : (
              <View style={styles.formGrid}>
                {POLICY_FIELDS.map((f) => {
                  if (policyServer[f.key] === undefined) {
                    return (
                      <View key={f.key} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <Text style={styles.missingText}>
                          Not present in DB — add via migration or seed script.
                        </Text>
                      </View>
                    );
                  }
                  return (
                    <View key={f.key} style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <TextInput
                        style={styles.input}
                        value={policyEdits[f.key] ?? ""}
                        onChangeText={(v) =>
                          setPolicyEdits((prev) => ({ ...prev, [f.key]: v }))
                        }
                        placeholder={f.type === "ratio" ? "0.10 – 5.00" : "0"}
                        placeholderTextColor={colors.textDisabledDark}
                        keyboardType={
                          f.type === "ratio" ? "decimal-pad" : "numeric"
                        }
                      />
                      <Text style={styles.helpText}>{f.helpText}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* ---------- Section 3: Operational Toggles ---------- */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Operational Toggles</Text>
                <Text style={styles.sectionSubtitle}>
                  SOS, face-match, app version, geofence, and other operational
                  knobs (system_config). Only keys present in the DB are shown.
                </Text>
              </View>
              <Pressable
                style={[
                  styles.saveBtn,
                  (!opHasChanges || savingOp) && styles.btnDisabled,
                ]}
                onPress={handleSaveOp}
                disabled={!opHasChanges || savingOp}
              >
                {savingOp ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
            {OP_FIELDS.filter((f) => opAvailableKeys.has(f.key)).length ===
            0 ? (
              <Text style={styles.emptyText}>
                No operational keys present in system_config.
              </Text>
            ) : (
              <View style={styles.formGrid}>
                {OP_FIELDS.filter((f) => opAvailableKeys.has(f.key)).map(
                  (f) => (
                    <View key={f.key} style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <TextInput
                        style={styles.input}
                        value={opEdits[f.key] ?? ""}
                        onChangeText={(v) =>
                          setOpEdits((prev) => ({ ...prev, [f.key]: v }))
                        }
                        placeholder={
                          f.type === "text"
                            ? "—"
                            : f.type === "score0_100"
                              ? "0 – 100"
                              : "0"
                        }
                        placeholderTextColor={colors.textDisabledDark}
                        keyboardType={f.type === "text" ? "default" : "numeric"}
                        autoCapitalize={f.type === "text" ? "none" : undefined}
                        autoCorrect={f.type !== "text"}
                      />
                      <Text style={styles.helpText}>{f.helpText}</Text>
                    </View>
                  ),
                )}
              </View>
            )}
          </View>
        </View>
      )}

      <AdminModal
        visible={confirmPause !== null}
        title={confirmPause === true ? "Pause dispatch?" : "Resume dispatch?"}
        onClose={() => setConfirmPause(null)}
        width={460}
        footer={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnGhost]}
              onPress={() => setConfirmPause(null)}
              disabled={togglingDispatch}
            >
              <Text style={styles.modalBtnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                confirmPause
                  ? { backgroundColor: colors.danger }
                  : { backgroundColor: colors.primary },
              ]}
              onPress={handleConfirmToggle}
              disabled={togglingDispatch}
            >
              {togglingDispatch ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <Text style={styles.modalBtnText}>
                  {confirmPause ? "Pause" : "Resume"}
                </Text>
              )}
            </Pressable>
          </View>
        }
      >
        <Text style={styles.confirmText}>
          {confirmPause
            ? "No new rides will be matched until dispatch is resumed. In-progress rides are unaffected. Continue?"
            : "Dispatch will resume matching new ride requests immediately. Continue?"}
        </Text>
      </AdminModal>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
  // --- Dispatch banner ---
  dispatchBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
  },
  dispatchPaused: {
    backgroundColor: "rgba(227, 29, 28, 0.12)",
    borderColor: colors.danger,
  },
  dispatchRunning: {
    backgroundColor: "rgba(12, 194, 95, 0.10)",
    borderColor: colors.primary,
  },
  dispatchBannerText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
    flex: 1,
    flexWrap: "wrap",
  },
  dispatchBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 150,
    alignItems: "center",
  },
  dispatchPauseBtn: { backgroundColor: colors.danger },
  dispatchResumeBtn: { backgroundColor: colors.primary },
  dispatchBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
  },
  // --- Section card ---
  sectionCard: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    padding: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 15,
  },
  sectionSubtitle: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 3,
    flexWrap: "wrap",
  },
  // --- Form grid ---
  formGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  fieldRow: {
    width: 320,
    maxWidth: "100%",
    gap: 6,
  },
  fieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  helpText: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  missingText: {
    color: colors.amber,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
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
  emptyText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    paddingVertical: 8,
  },
  // --- Buttons ---
  saveBtn: {
    backgroundColor: colors.adminAccent,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  ghostBtn: {
    backgroundColor: colors.darkSecondary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  ghostBtnDisabled: { opacity: 0.5 },
  ghostBtnText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  btnDisabled: { opacity: 0.45 },
  // --- Modal ---
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 90,
    alignItems: "center",
  },
  modalBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  modalBtnGhostText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  modalBtnText: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  confirmText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    lineHeight: 20,
  },
});
