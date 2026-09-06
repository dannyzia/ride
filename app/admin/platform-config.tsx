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

// ----- Section 4: Hotspots (platform_config freshness + zone_heat tiers) -----
interface AdminHotspotRow {
  zone_id: string;
  zone_name: string;
  zone_is_active: boolean;
  tag: "hot" | "neutral" | "cold";
  score: string;
  idle_driver_count: number;
  valid_from: string | null;
  valid_to: string | null;
  computed_at: string;
  updated_at: string;
}

interface HotspotsResponse {
  hotspots?: AdminHotspotRow[];
  total?: number;
}

const HOTSPOT_TIER_OPTIONS = ["low", "medium", "high"] as const;
type HotspotTierOption = (typeof HOTSPOT_TIER_OPTIONS)[number];
const HOTSPOT_TIER_TO_TAG: Record<HotspotTierOption, AdminHotspotRow["tag"]> = {
  low: "cold",
  medium: "neutral",
  high: "hot",
};
const HOTSPOT_TIER_DOT: Record<AdminHotspotRow["tag"], string> = {
  cold: "#0CC25F",
  neutral: "#FFC107",
  hot: "#E31D1C",
};
const HOTSPOT_FRESHNESS_KEY = "hotspot_freshness_minutes";
const HOTSPOT_FRESHNESS_DEFAULT = "10";

// ----- Section 2: Platform Policy (platform_config) -----
type PolicyType = "ratio" | "moneyTaka" | "integer";
interface PolicyField {
  key: string;
  label: string;
  helpText: string;
  type: PolicyType;
  /** Optional range [min, max] for validation */
  range?: [number, number];
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

// Plan-05 operational bounds (platform_config)
const POLICY5_FIELDS: PolicyField[] = [
  {
    key: "sos_cooldown_seconds",
    label: "SOS Cooldown (seconds)",
    helpText:
      "Minimum gap between SOS alerts per user. Prevents rapid re-triggering.",
    type: "integer",
    range: [0, 7200],
  },
  {
    key: "sos_auto_resolve_seconds",
    label: "SOS Auto-Resolve (seconds)",
    helpText:
      "Time after which an unacknowledged SOS is auto-resolved by the scheduler.",
    type: "integer",
    range: [60, 14400],
  },
  {
    key: "schedule_min_lead_minutes",
    label: "Schedule Min Lead (minutes)",
    helpText:
      "Minimum advance time a ride can be scheduled (client + server enforced).",
    type: "integer",
    range: [5, 120],
  },
  {
    key: "schedule_max_lead_days",
    label: "Schedule Max Lead (days)",
    helpText:
      "Maximum days ahead a ride can be scheduled.",
    type: "integer",
    range: [1, 30],
  },
  {
    key: "cancel_grace_period_seconds",
    label: "Cancel Grace Period (seconds)",
    helpText:
      "Free cancellation window after booking. Riders are not charged if they cancel within this period.",
    type: "integer",
    range: [0, 600],
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

  // Zone multi-active toggle (platform_config boolean)
  const [zoneMultiActive, setZoneMultiActive] = useState(false);
  const [zoneMultiActiveOriginal, setZoneMultiActiveOriginal] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  const [opServer, setOpServer] = useState<Record<string, string>>({});
  const [opEdits, setOpEdits] = useState<Record<string, string>>({});
  const [opAvailableKeys, setOpAvailableKeys] = useState<Set<string>>(
    new Set(),
  );
  const [savingOp, setSavingOp] = useState(false);

  // Hotspots section state
  const [hotspotFreshnessServer, setHotspotFreshnessServer] =
    useState<string>(HOTSPOT_FRESHNESS_DEFAULT);
  const [hotspotFreshnessEdit, setHotspotFreshnessEdit] = useState<string>(
    HOTSPOT_FRESHNESS_DEFAULT,
  );
  const [hotspotRows, setHotspotRows] = useState<AdminHotspotRow[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(true);
  const [savingHotspot, setSavingHotspot] = useState(false);
  const [hotspotZoneId, setHotspotZoneId] = useState("");
  const [hotspotTier, setHotspotTier] = useState<HotspotTierOption>("high");
  const [hotspotValidFrom, setHotspotValidFrom] = useState("");
  const [hotspotValidTo, setHotspotValidTo] = useState("");

  const loadHotspots = useCallback(async () => {
    setHotspotsLoading(true);
    const res = await adminFetch<HotspotsResponse>(
      "/api/admin/hotspots?limit=100",
      { method: "GET" },
    );
    if (!res.error && res.data?.hotspots) {
      setHotspotRows(res.data.hotspots);
    }
    setHotspotsLoading(false);
  }, []);

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

      // Zone multi-active flag
      const zoneVal = map["zone_multi_active_enabled"] === "true";
      setZoneMultiActive(zoneVal);
      setZoneMultiActiveOriginal(zoneVal);

      // Hotspot freshness window (platform_config; falls back to the default)
      const freshRow = (policyRes.data.config ?? []).find(
        (r) => r.key === HOTSPOT_FRESHNESS_KEY,
      );
      const freshVal = freshRow?.value ?? HOTSPOT_FRESHNESS_DEFAULT;
      setHotspotFreshnessServer(freshVal);
      setHotspotFreshnessEdit(freshVal);
    }

    loadHotspots().catch(() => setHotspotsLoading(false));

    setLoading(false);
  }, [toast, loadHotspots]);

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
        [...POLICY_FIELDS, ...POLICY5_FIELDS].filter((f) => {
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
    for (const f of [...POLICY_FIELDS, ...POLICY5_FIELDS]) {
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
      if (f.type === "integer") {
        const n = Number(serialized);
        if (!Number.isInteger(n) || n < 0) {
          toast.show(`${f.label} must be a non-negative integer`, "error");
          return;
        }
        if (f.range) {
          const [min, max] = f.range;
          if (n < min || n > max) {
            toast.show(`${f.label} must be between ${min} and ${max}`, "error");
            return;
          }
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
      if ([...POLICY_FIELDS, ...POLICY5_FIELDS].some((f) => f.key === r.key))
        map[r.key] = r.value;
    }
    setPolicyServer(map);
    const editsMap: Record<string, string> = {};
    for (const f of [...POLICY_FIELDS, ...POLICY5_FIELDS]) {
      if (map[f.key] !== undefined) {
        const scale = f.type === "moneyTaka" ? 100 : 1;
        editsMap[f.key] = parseDisplayNumber(map[f.key], scale);
      }
    }
    setPolicyEdits(editsMap);
    toast.show("Platform policy saved", "success");
    setSavingPolicy(false);
  };

  // ----- Zone multi-active toggle save -----
  const zoneDirty = zoneMultiActive !== zoneMultiActiveOriginal;

  const handleSaveZone = async () => {
    setSavingZone(true);
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/config",
      {
        method: "PATCH",
        body: JSON.stringify({
          updates: [
            {
              key: "zone_multi_active_enabled",
              value: zoneMultiActive ? "true" : "false",
            },
          ],
        }),
      },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Zone toggle failed: ${error ?? "unknown"}`, "error");
      } else {
        toast.show("Zone toggle failed: network error", "error");
      }
      setSavingZone(false);
      return;
    }
    // Update server baseline from response
    const map: Record<string, string> = {};
    for (const r of data.config ?? []) {
      map[r.key] = r.value;
    }
    const newVal = map["zone_multi_active_enabled"] === "true";
    setZoneMultiActive(newVal);
    setZoneMultiActiveOriginal(newVal);
    // Also update policyServer so the field is tracked correctly
    setPolicyServer((prev) => ({
      ...prev,
      zone_multi_active_enabled: map["zone_multi_active_enabled"] ?? "false",
    }));
    toast.show(
      newVal
        ? "Multi-zone enabled — drivers resolve zone from coordinates"
        : "Multi-zone disabled — single active zone mode",
      newVal ? "warning" : "success",
    );
    setSavingZone(false);
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

  // ----- Hotspot save (Section 4) -----
  const hotspotFreshnessDirty = hotspotFreshnessEdit !== hotspotFreshnessServer;

  const handleSaveHotspotFreshness = async () => {
    const n = Number(hotspotFreshnessEdit);
    if (!Number.isInteger(n) || n <= 0) {
      toast.show("Freshness window must be a positive integer (minutes)", "error");
      return;
    }
    setSavingHotspot(true);
    const { error, status } = await adminFetch<ConfigResponse>("/api/admin/config", {
      method: "PATCH",
      body: JSON.stringify({
        updates: [{ key: HOTSPOT_FRESHNESS_KEY, value: String(n) }],
      }),
    });
    if (error || status === 0) {
      toast.show(
        `Save failed: ${error ?? (status === 0 ? "network error" : "unknown")}`,
        "error",
      );
      setSavingHotspot(false);
      return;
    }
    setHotspotFreshnessServer(String(n));
    toast.show("Hotspot settings saved", "success");
    setSavingHotspot(false);
  };

  const handleAddHotspot = async () => {
    const zoneId = hotspotZoneId.trim();
    if (!zoneId) {
      toast.show("Zone ID is required", "error");
      return;
    }
    const item: {
      zone_id: string;
      tier: HotspotTierOption;
      valid_from?: string;
      valid_to?: string;
    } = { zone_id: zoneId, tier: hotspotTier };
    const from = hotspotValidFrom.trim();
    const to = hotspotValidTo.trim();
    if (from) {
      const d = new Date(from);
      if (Number.isNaN(d.getTime())) {
        toast.show("Valid From must be an ISO date-time (e.g. 2026-09-06T00:00:00Z)", "error");
        return;
      }
      item.valid_from = d.toISOString();
    }
    if (to) {
      const d = new Date(to);
      if (Number.isNaN(d.getTime())) {
        toast.show("Valid To must be an ISO date-time (e.g. 2026-09-07T00:00:00Z)", "error");
        return;
      }
      item.valid_to = d.toISOString();
    }

    setSavingHotspot(true);
    const { error, status } = await adminFetch<{ added?: number }>(
      "/api/admin/hotspots",
      { method: "POST", body: JSON.stringify({ items: [item] }) },
    );
    if (error || status === 0) {
      toast.show(
        `Add failed: ${error ?? (status === 0 ? "network error" : "unknown")}`,
        "error",
      );
      setSavingHotspot(false);
      return;
    }
    setHotspotZoneId("");
    setHotspotValidFrom("");
    setHotspotValidTo("");
    toast.show("Hotspot tier assigned", "success");
    await loadHotspots();
    setSavingHotspot(false);
  };

  const handleDeleteHotspot = async (zoneId: string) => {
    setSavingHotspot(true);
    const { error, status } = await adminFetch<{ ok?: boolean }>(
      `/api/admin/hotspots?id=${encodeURIComponent(zoneId)}`,
      { method: "DELETE" },
    );
    if (error || status === 0) {
      toast.show(
        `Delete failed: ${error ?? (status === 0 ? "network error" : "unknown")}`,
        "error",
      );
      setSavingHotspot(false);
      return;
    }
    toast.show("Hotspot removed", "success");
    await loadHotspots();
    setSavingHotspot(false);
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
                  ? "DISPATCH PAUSED — no new rides being matched"
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

            {/* ── Plan-05 Operational Bounds ── */}
            <View style={styles.plan05Divider} />
            <Text style={styles.plan05SectionTitle}>Plan 05 — Operational Bounds</Text>
            <Text style={styles.plan05SectionSubtitle}>
              SOS, scheduling, and cancellation behaviour. Changes take effect
              within 60 seconds (platform_config fresh-read).
            </Text>
            <View style={styles.formGrid}>
              {POLICY5_FIELDS.map((f) => {
                if (policyServer[f.key] === undefined) {
                  return (
                    <View key={f.key} style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>{f.label}</Text>
                      <Text style={styles.missingText}>
                        Not present in DB — add via seed script.
                      </Text>
                    </View>
                  );
                }
                const rangeText = f.range
                  ? `${f.range[0]} – ${f.range[1]}`
                  : "0";
                return (
                  <View key={f.key} style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    <TextInput
                      style={styles.input}
                      value={policyEdits[f.key] ?? ""}
                      onChangeText={(v) =>
                        setPolicyEdits((prev) => ({ ...prev, [f.key]: v }))
                      }
                      placeholder={rangeText}
                      placeholderTextColor={colors.textDisabledDark}
                      keyboardType="numeric"
                    />
                    <Text style={styles.helpText}>{f.helpText}</Text>
                  </View>
                );
              })}
            </View>

            {/* ── Zone Multi-Active Toggle ── */}
            <View style={styles.zoneToggleDivider} />
            <View style={styles.zoneToggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Multi-Zone Mode</Text>
                <Text style={styles.helpText}>
                  {"When enabled, drivers resolve their zone from GPS coordinates ("
                    + "smallest containing polygon wins). When disabled, only "
                    + "one zone can be active at a time."}
                </Text>
              </View>
              <Pressable
                style={[
                  styles.toggleTrack,
                  zoneMultiActive && styles.toggleTrackActive,
                  savingZone && styles.btnDisabled,
                ]}
                onPress={() => setZoneMultiActive((prev) => !prev)}
                disabled={savingZone}
                accessibilityRole="switch"
                accessibilityState={{ checked: zoneMultiActive }}
                accessibilityLabel="Toggle multi-zone mode"
              >
                <View
                  style={[
                    styles.toggleThumb,
                    zoneMultiActive && styles.toggleThumbActive,
                  ]}
                />
              </Pressable>
            </View>
            {zoneMultiActive && (
              <View style={styles.zoneWarningBanner}>
                <Text style={styles.zoneWarningText}>
                  ⚠ Multi-zone is ON. All active zones are loaded on every "
                  + "heartbeat and fare estimate. Ensure zone polygons do not "
                  + "overlap unintentionally — the smallest polygon containing "
                  + "the point wins. Disable if you only operate in one zone."
                </Text>
              </View>
            )}
            {zoneDirty && (
              <View style={styles.zoneSaveRow}>
                <Pressable
                  style={[styles.saveBtn, savingZone && styles.btnDisabled]}
                  onPress={handleSaveZone}
                  disabled={savingZone}
                >
                  {savingZone ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Save Zone Mode</Text>
                  )}
                </Pressable>
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

          {/* ---------- Section 4: Hotspots ---------- */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Hotspots</Text>
                <Text style={styles.sectionSubtitle}>
                  Demand-tier labels on the existing zone_heat table. Advisory
                  only — never read by dispatch or fares. A pinned tier stays
                  until its validity window ends and the heat engine
                  recomputes the zone.
                </Text>
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>
                  Freshness Window (minutes)
                </Text>
                <TextInput
                  style={styles.input}
                  value={hotspotFreshnessEdit}
                  onChangeText={setHotspotFreshnessEdit}
                  placeholder={HOTSPOT_FRESHNESS_DEFAULT}
                  placeholderTextColor={colors.textDisabledDark}
                  keyboardType="numeric"
                />
                <Text style={styles.helpText}>
                  zone_heat readings older than this are treated as stale and
                  hidden from the hotspot surface. Default: 10.
                </Text>
                <Pressable
                  style={[
                    styles.saveBtn,
                    (!hotspotFreshnessDirty || savingHotspot) && styles.btnDisabled,
                    { marginTop: 6 },
                  ]}
                  onPress={handleSaveHotspotFreshness}
                  disabled={!hotspotFreshnessDirty || savingHotspot}
                >
                  <Text style={styles.saveBtnText}>Save Window</Text>
                </Pressable>
              </View>

              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Assign Tier (Zone ID)</Text>
                <TextInput
                  style={styles.input}
                  value={hotspotZoneId}
                  onChangeText={setHotspotZoneId}
                  placeholder="zone uuid"
                  placeholderTextColor={colors.textDisabledDark}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text style={styles.fieldLabel}>Tier</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {HOTSPOT_TIER_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt}
                      style={[
                        styles.hotspotTierChip,
                        hotspotTier === opt && styles.hotspotTierChipActive,
                      ]}
                      onPress={() => setHotspotTier(opt)}
                    >
                      <View
                        style={[
                          styles.hotspotDot,
                          { backgroundColor: HOTSPOT_TIER_DOT[HOTSPOT_TIER_TO_TAG[opt]] },
                        ]}
                      />
                      <Text
                        style={[
                          styles.hotspotTierChipText,
                          hotspotTier === opt && styles.hotspotTierChipTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.fieldLabel}>
                  Validity (optional, ISO 8601)
                </Text>
                <TextInput
                  style={styles.input}
                  value={hotspotValidFrom}
                  onChangeText={setHotspotValidFrom}
                  placeholder="valid_from e.g. 2026-09-06T00:00:00Z"
                  placeholderTextColor={colors.textDisabledDark}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  style={styles.input}
                  value={hotspotValidTo}
                  onChangeText={setHotspotValidTo}
                  placeholder="valid_to e.g. 2026-09-07T00:00:00Z"
                  placeholderTextColor={colors.textDisabledDark}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  style={[
                    styles.saveBtn,
                    savingHotspot && styles.btnDisabled,
                    { marginTop: 6 },
                  ]}
                  onPress={handleAddHotspot}
                  disabled={savingHotspot}
                >
                  {savingHotspot ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <Text style={styles.saveBtnText}>Assign Tier</Text>
                  )}
                </Pressable>
              </View>
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
              Current Zone Heat Rows
            </Text>
            {hotspotsLoading ? (
              <ActivityIndicator color={colors.adminAccent} style={{ marginTop: 12 }} />
            ) : hotspotRows.length === 0 ? (
              <Text style={styles.emptyText}>No zone_heat rows.</Text>
            ) : (
              <View style={{ gap: 8, marginTop: 8 }}>
                {hotspotRows.map((h) => (
                  <View key={h.zone_id} style={styles.hotspotRow}>
                    <View
                      style={[
                        styles.hotspotDot,
                        { backgroundColor: HOTSPOT_TIER_DOT[h.tag] },
                      ]}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.hotspotRowTitle}>
                        {h.zone_name}
                        {!h.zone_is_active ? " (inactive)" : ""}
                      </Text>
                      <Text style={styles.hotspotRowSub}>
                        tier {h.tag} · score {Number(h.score).toFixed(2)} · idle{" "}
                        {h.idle_driver_count}
                        {h.valid_from || h.valid_to
                          ? ` · window ${h.valid_from ?? "…"} → ${h.valid_to ?? "…"}`
                          : ""}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.hotspotDeleteBtn}
                      onPress={() => handleDeleteHotspot(h.zone_id)}
                      disabled={savingHotspot}
                    >
                      <Text style={styles.hotspotDeleteText}>Remove</Text>
                    </Pressable>
                  </View>
                ))}
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
  // --- Hotspot section ---
  hotspotTierChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2D35",
    backgroundColor: "#181A20",
  },
  hotspotTierChipActive: { borderColor: colors.adminAccent },
  hotspotTierChipText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
  },
  hotspotTierChipTextActive: { color: colors.textPrimaryDark },
  hotspotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hotspotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hotspotRowTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  hotspotRowSub: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  hotspotDeleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  hotspotDeleteText: {
    color: colors.danger,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
  },
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
  // --- Plan-05 section ---
  plan05Divider: {
    height: 1,
    backgroundColor: "#2A2D35",
    marginTop: 16,
    marginBottom: 12,
  },
  plan05SectionTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
    marginBottom: 4,
  },
  plan05SectionSubtitle: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginBottom: 12,
  },
  // --- Zone toggle ---
  zoneToggleDivider: {
    height: 1,
    backgroundColor: "#2A2D35",
    marginVertical: 16,
  },
  zoneToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#3A3D45",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  toggleTrackActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.white,
  },
  toggleThumbActive: {
    alignSelf: "flex-end",
  },
  zoneWarningBanner: {
    marginTop: 12,
    backgroundColor: "rgba(255, 183, 77, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 183, 77, 0.30)",
    borderRadius: 8,
    padding: 12,
  },
  zoneWarningText: {
    color: colors.amber,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  zoneSaveRow: {
    marginTop: 12,
    alignItems: "flex-start",
  },
});
