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
import {
  getDefaultFuelParams,
  computeBikeOrCngRates,
  computeCarRates,
  type TierFuelParams,
} from "@/lib/tierRateDerivation";
import { type VehicleTypeEnum, VEHICLE_TYPES, PICKUP_CATEGORY } from "@/lib/vehicleTypes";
import type { AdminRole } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

interface ConfigItem {
  key: string;
  value: string;
  updated_at: string;
}

interface ConfigResponse {
  config?: ConfigItem[];
}

type FieldType = "boolean" | "number" | "csv" | "rateDisplay";

interface FieldDef {
  key: string;
  label: string;
  helpText: string;
  type: FieldType;
  locked?: boolean;
}

const PICKUP_FIELDS: FieldDef[] = [
  {
    key: "pickup_measurement_enabled",
    label: "Measurement Enabled",
    helpText: "Stage 0 hinge — harvests pickup distance samples with zero rider impact.",
    type: "boolean",
  },
  {
    key: "pickup_fee_enabled",
    label: "Pickup Fee Enabled",
    helpText: "Stage 1 rider-charge switch. Requires calibrated radii before enabling.",
    type: "boolean",
  },
  {
    key: "pickup_free_radius_km_bike",
    label: "Free Radius — Bike (km)",
    helpText: "Distance within which pickup is free for bike category.",
    type: "number",
  },
  {
    key: "pickup_free_radius_km_cng",
    label: "Free Radius — CNG (km)",
    helpText: "Distance within which pickup is free for CNG category.",
    type: "number",
  },
  {
    key: "pickup_free_radius_km_car",
    label: "Free Radius — Car (km)",
    helpText: "Distance within which pickup is free for car category.",
    type: "number",
  },
  {
    key: "pickup_rate_multiplier_bike",
    label: "Rate Multiplier — Bike",
    helpText: "Locked: 0.75 × trip per-km rate.",
    type: "rateDisplay",
    locked: true,
  },
  {
    key: "pickup_rate_multiplier_cng",
    label: "Rate Multiplier — CNG",
    helpText: "Locked: 0.80 × trip per-km rate.",
    type: "rateDisplay",
    locked: true,
  },
  {
    key: "pickup_rate_multiplier_car",
    label: "Rate Multiplier — Car",
    helpText: "Locked: 0.90 × trip per-km rate.",
    type: "rateDisplay",
    locked: true,
  },
  {
    key: "pickup_cap_billable_km_bike",
    label: "Cap Billable Km — Bike",
    helpText: "Max billable pickup km for bike.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_cap_billable_km_cng",
    label: "Cap Billable Km — CNG",
    helpText: "Max billable pickup km for CNG.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_cap_billable_km_car",
    label: "Cap Billable Km — Car",
    helpText: "Max billable pickup km for car.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_cap_pct_of_fare",
    label: "Backstop Cap (% of fare)",
    helpText: "Pickup fee cannot exceed this % of trip fare.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_trueup_cap_multiplier",
    label: "True-Up Cap Multiplier",
    helpText: "Upward true-up capped at firm × this multiplier.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_origin_confidence_min",
    label: "Origin Confidence Min",
    helpText: "Below this, fee freezes at firm quote.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_pin_tolerance_m",
    label: "Pin Tolerance (m)",
    helpText: "Max distance for silent pickup re-quote.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_max_forced_requotes",
    label: "Max Forced Requotes",
    helpText: "Beyond this, pickup-move returns cancel-only.",
    type: "number",
    locked: true,
  },
  {
    key: "pickup_trace_max_segment_speed_kmh",
    label: "Trace Max Segment Speed (km/h)",
    helpText: "Segments above this speed are dropped from trace.",
    type: "number",
  },
  {
    key: "pickup_no_driver_fallback_km",
    label: "No-Driver Fallback (km)",
    helpText: "Fallback distance when zero drivers in pool.",
    type: "number",
  },
  {
    key: "pickup_low_confidence_zone_ids",
    label: "Low-Confidence Zone IDs",
    helpText: "CSV of zone IDs whose rider quote range is auto-widened.",
    type: "csv",
  },
];

const DISPATCH_FIELDS: FieldDef[] = [
  {
    key: "cold_drop_boost_enabled",
    label: "Cold-Drop Boost Enabled",
    helpText: "Temporary rank boost for drivers near cold drop zones.",
    type: "boolean",
  },
  {
    key: "cold_drop_boost_multiplier",
    label: "Cold-Drop Boost Multiplier",
    helpText: "Score multiplier for cold-drop proximity.",
    type: "number",
  },
  {
    key: "cold_drop_boost_decay_minutes",
    label: "Cold-Drop Decay (minutes)",
    helpText: "Boost decays to zero over this window.",
    type: "number",
    locked: true,
  },
  {
    key: "return_lead_affinity_multiplier",
    label: "Return-Lead Affinity Multiplier",
    helpText: "Score boost for return-to-cold-zone leads.",
    type: "number",
  },
  {
    key: "new_driver_priority_days",
    label: "New Driver Priority (days)",
    helpText: "Protected dispatch tier for new drivers.",
    type: "number",
    locked: true,
  },
  {
    key: "new_driver_priority_leads",
    label: "New Driver Priority Leads (N)",
    helpText: "Number of priority leads. Default 10 — first 10 leads priority; 0 = off.",
    type: "number",
  },
  {
    key: "dispatch_offer_ttl_seconds",
    label: "Offer TTL (seconds)",
    helpText: "Time limit for driver to accept an offer.",
    type: "number",
  },
];

const DAWDLE_FIELDS: FieldDef[] = [
  {
    key: "dawdle_rolling_pickups",
    label: "Rolling Pickup Window",
    helpText: "Number of charged pickups in rolling window.",
    type: "number",
    locked: true,
  },
  {
    key: "dawdle_median_threshold",
    label: "Median Threshold",
    helpText: "Flag when median realized/firm ratio exceeds this.",
    type: "number",
    locked: true,
  },
  {
    key: "dawdle_p90_threshold",
    label: "P90 Threshold",
    helpText: "Flag when p90 realized/firm ratio exceeds this.",
    type: "number",
    locked: true,
  },
  {
    key: "dawdle_zone_margin",
    label: "Zone Margin",
    helpText: "Added to zone-relative threshold.",
    type: "number",
    locked: true,
  },
  {
    key: "dawdle_window_days",
    label: "Window (days)",
    helpText: "Rolling window for dawdle evaluation.",
    type: "number",
    locked: true,
  },
  {
    key: "dawdle_escalation_windows",
    label: "Escalation Windows",
    helpText: "Cooldown escalation in days (e.g. 1,2,4).",
    type: "csv",
    locked: true,
  },
  {
    key: "zone_recal_deviation_pct",
    label: "Zone Recal Deviation (%)",
    helpText: "Trigger recalibration when deviation exceeds this.",
    type: "number",
    locked: true,
  },
  {
    key: "zone_recal_min_sample_rides",
    label: "Zone Recal Min Samples",
    helpText: "Minimum sample rides before recalibration triggers.",
    type: "number",
  },
  {
    key: "zone_recal_review_sla_days",
    label: "Zone Recal Review SLA (days)",
    helpText: "Review deadline for recalibration queue.",
    type: "number",
    locked: true,
  },
];

// ── REV-6: Fuel engine setup (G-2a / G-2c / G-2d / ROUND-13) ──
// All fuel/joma/target config keys fetched from platform_config.
const FUEL_CONFIG_KEYS = [
  // Global fuel prices
  "fuel_price_octane_bdt",
  "fuel_price_petrol_bdt",
  "fuel_price_cng_bdt",
  // Per-tier fuel efficiency
  "fuel_efficiency_bike_basic",
  "fuel_efficiency_bike_standard",
  "fuel_efficiency_bike_plus",
  "fuel_efficiency_cng",
  "fuel_efficiency_car_compact",
  "fuel_efficiency_car_economy",
  "fuel_efficiency_car_comfort",
  "fuel_efficiency_car_premium",
  "fuel_efficiency_car_xl",
  // Driver maintenance per km
  "driver_maint_per_km_bike",
  "driver_maint_per_km_cng",
  "driver_maint_per_km_car",
  // Daily targets
  "daily_target_bdt_bike",
  "daily_target_bdt_cng",
  "daily_target_bdt_car",
  // Expected billed minutes
  "expected_billed_minutes_bike",
  "expected_billed_minutes_cng",
  "expected_billed_minutes_car",
  // Joma recovery
  "joma_monthly_bdt_bike_eco",
  "joma_monthly_bdt_bike_std",
  "joma_monthly_bdt_bike_prem",
  "joma_daily_bdt_cng",
  "joma_operating_days_per_month",
] as const;

// Per-vehicle-type tier display — expanded to all 9 types per ROUND-13 Item 3.
interface VehicleTierDisplay {
  vehicleType: VehicleTypeEnum;
  label: string;
  category: string;
  compute: (p: TierFuelParams) => { km_rate: number; time_rate: number };
}

const VEHICLE_TIER_DISPLAY: VehicleTierDisplay[] = (
  VEHICLE_TYPES.map((vt) => {
    const cat = PICKUP_CATEGORY[vt.key];
    return {
      vehicleType: vt.key,
      label: vt.display_en,
      category: cat,
      compute: cat === "car" ? computeCarRates : computeBikeOrCngRates,
    };
  })
);

function formatPaisaTaka(paisa: number): string {
  return `${Math.round(paisa / 100)}`;
}

// Fuel price key for each category.
const FUEL_PRICE_KEY: Record<string, string> = {
  bike: "fuel_price_petrol_bdt",
  cng: "fuel_price_cng_bdt",
  car: "fuel_price_octane_bdt",
};

// Maintain key pattern: driver_maint_per_km_{category}.
const MAINT_KEY: Record<string, string> = {
  bike: "driver_maint_per_km_bike",
  cng: "driver_maint_per_km_cng",
  car: "driver_maint_per_km_car",
};

const DAILY_TARGET_KEY: Record<string, string> = {
  bike: "daily_target_bdt_bike",
  cng: "daily_target_bdt_cng",
  car: "daily_target_bdt_car",
};

const BILLED_MINUTES_KEY: Record<string, string> = {
  bike: "expected_billed_minutes_bike",
  cng: "expected_billed_minutes_cng",
  car: "expected_billed_minutes_car",
};

// Joma key per vehicle type.
function jomaKeyForType(vt: VehicleTypeEnum): string | null {
  const cat = PICKUP_CATEGORY[vt];
  if (cat === "cng") return "joma_daily_bdt_cng";
  if (cat === "bike") {
    if (vt === "bike_plus") return "joma_monthly_bdt_bike_prem";
    if (vt === "bike_standard") return "joma_monthly_bdt_bike_std";
    return "joma_monthly_bdt_bike_eco";
  }
  return null; // car — back-solve, no joma term
}

const PER_KM_BDT: Record<string, number> = {
  bike: 25,
  cng: 35,
  car: 50,
};

export default function FareConfigScreen() {
  const toast = useAdminToast();
  const [serverValues, setServerValues] = useState<Record<string, string>>({});
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // REV-6: Fuel config values — read + edit for fare engine setup.
  const [fuelServer, setFuelServer] = useState<Record<string, string>>({});
  const [fuelEdits, setFuelEdits] = useState<Record<string, string>>({});
  const [savingFuel, setSavingFuel] = useState(false);

  // ROUND-13: Admin role for RBAC-tier gating.
  const [adminRole, setAdminRole] = useState<AdminRole | null>(null);

  const isEditor = useMemo(
    () => adminRole === "owner" || adminRole === "admin",
    [adminRole],
  );

  const allFields = useMemo(
    () => [...PICKUP_FIELDS, ...DISPATCH_FIELDS, ...DAWDLE_FIELDS],
    [],
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const [configRes, roleRes] = await Promise.all([
      adminFetch<ConfigResponse>("/api/admin/config", { method: "GET" }),
      // Fetch current user role from supabase (client-side, same pattern as layout).
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const { data } = await supabase
          .from("users")
          .select("role")
          .eq("auth_uid", user.id)
          .maybeSingle();
        return data?.role as AdminRole | null;
      })(),
    ]);
    const { data, error, status } = configRes;
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Failed to load config: ${error ?? "unknown"}`, "error");
      }
      setLoading(false);
      return;
    }
    const map: Record<string, string> = {};
    const fuelMap: Record<string, string> = {};
    for (const r of data.config ?? []) {
      if (allFields.some((f) => f.key === r.key)) map[r.key] = r.value;
      if (FUEL_CONFIG_KEYS.includes(r.key as typeof FUEL_CONFIG_KEYS[number])) {
        fuelMap[r.key] = r.value;
      }
    }
    setServerValues(map);
    setFuelServer(fuelMap);
    setFuelEdits({ ...fuelMap });
    const editsMap: Record<string, string> = {};
    for (const f of allFields) {
      if (map[f.key] !== undefined) {
        editsMap[f.key] = map[f.key];
      }
    }
    setEdits(editsMap);
    setAdminRole(roleRes);
    setLoading(false);
  }, [toast, allFields]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const dirtyKeys = useMemo(() => {
    return new Set(
      allFields
        .filter((f) => {
          if (f.locked) return false;
          return serverValues[f.key] !== undefined && edits[f.key] !== serverValues[f.key];
        })
        .map((f) => f.key),
    );
  }, [allFields, edits, serverValues]);

  const hasChanges = dirtyKeys.size > 0;

  // ROUND-13 Item 3: Compute derived required-gross per vehicle type.
  const derivedVehicles = useMemo(() => {
    return VEHICLE_TIER_DISPLAY.map((tier) => {
      const cat = tier.category;
      const params = getDefaultFuelParams(tier.vehicleType);
      // Override fuel price from admin-entered value.
      const adminFuel = Number(fuelEdits[FUEL_PRICE_KEY[cat]] ?? 0);
      if (adminFuel > 0) {
        params.fuel_price_bdt_per_unit = Math.round(adminFuel * 100);
      }
      // Override maint from admin.
      const adminMaint = Number(fuelEdits[MAINT_KEY[cat]] ?? 0);
      if (adminMaint > 0) {
        params.driver_maint_per_km = Math.round(adminMaint * 100);
      }
      // Override daily target from admin.
      const adminTarget = Number(fuelEdits[DAILY_TARGET_KEY[cat]] ?? 0);
      if (adminTarget > 0) {
        params.daily_target_bdt = Math.round(adminTarget * 100);
      }
      // Override billed minutes from admin.
      const adminBilled = Number(fuelEdits[BILLED_MINUTES_KEY[cat]] ?? 0);
      if (adminBilled > 0) {
        params.expected_billed_minutes = adminBilled;
      }
      // Override joma from admin.
      const jomaK = jomaKeyForType(tier.vehicleType);
      if (jomaK) {
        const adminJoma = Number(fuelEdits[jomaK] ?? 0);
        if (cat === "cng") {
          params.joma_daily_bdt = adminJoma > 0 ? adminJoma : params.joma_daily_bdt;
        } else {
          params.joma_monthly_bdt = adminJoma > 0 ? adminJoma : params.joma_monthly_bdt;
        }
      }
      // Override efficiency from admin.
      const effKey = `fuel_efficiency_${tier.vehicleType}` as string;
      const adminEff = Number(fuelEdits[effKey] ?? 0);
      if (adminEff > 0) {
        params.fuel_efficiency_km_per_unit = adminEff;
      }
      // Compute derived rates (km_rate/time_rate not used directly — required_gross computed below).
      const _rates = tier.compute(params);
      // required_gross ≈ (fuel/km + maint/km + joma/km) × daily_km + target (paisa)
      const fuelPerKm = Math.round(
        (params.fuel_price_bdt_per_unit * 100) /
          params.fuel_efficiency_km_per_unit,
      );
      const jomaPerKmVal =
        cat === "car"
          ? 0
          : Math.round(
              ((params.joma_monthly_bdt ?? 0) * 100) /
                ((params.operating_days_per_month ?? 26) *
                  (params.estimated_daily_km ?? 1)),
            );
      const totalPerKm = fuelPerKm + params.driver_maint_per_km + jomaPerKmVal;
      const dailyKm = params.estimated_daily_km ?? 100;
      const requiredGrossPaisa = totalPerKm * dailyKm + params.daily_target_bdt;
      const requiredGrossTaka = Math.round(requiredGrossPaisa / 100);
      return {
        vehicleType: tier.vehicleType,
        label: tier.label,
        category: cat,
        fuelPerKmPaisa: fuelPerKm,
        maintPerKmPaisa: params.driver_maint_per_km,
        dailyTargetBDT: params.daily_target_bdt / 100,
        requiredGrossBDT: requiredGrossTaka,
      };
    });
  }, [fuelEdits]);

  // Fuel config dirty check.
  const fuelDirtyKeys = useMemo(
    () =>
      FUEL_CONFIG_KEYS.filter((k) => fuelEdits[k] !== fuelServer[k]),
    [fuelEdits, fuelServer],
  );
  const hasFuelChanges = fuelDirtyKeys.length > 0;

  const handleExportCsv = () => {
    const lines: string[] = ["key,value"];
    for (const k of FUEL_CONFIG_KEYS) {
      lines.push(`${k},${fuelEdits[k] ?? ""}`);
    }
    lines.push("");
    lines.push("vehicle_type,required_gross_bdt_per_day,fuel_per_km_paisa,maint_per_km_paisa,daily_target_bdt");
    for (const vt of derivedVehicles) {
      lines.push(`${vt.vehicleType},${vt.requiredGrossBDT},${vt.fuelPerKmPaisa},${vt.maintPerKmPaisa},${vt.dailyTargetBDT}`);
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fare-engine-config-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.show("CSV exported", "success");
  };

  const handleSaveFuel = async () => {
    if (!hasFuelChanges) {
      toast.show("No fuel changes to save", "info");
      return;
    }
    const updates: { key: string; value: string }[] = [];
    for (const k of fuelDirtyKeys) {
      const val = fuelEdits[k] ?? "";
      const n = Number(val);
      if (!Number.isFinite(n) || n < 0) {
        toast.show(`${k} must be a positive number`, "error");
        return;
      }
      updates.push({ key: k, value: val });
    }
    if (updates.length === 0) return;
    setSavingFuel(true);
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/config",
      { method: "PATCH", body: JSON.stringify({ updates }) },
    );
    if (error || !data) {
      if (status !== 0) {
        toast.show(`Fuel save failed: ${error ?? "unknown"}`, "error");
      } else {
        toast.show("Fuel save failed: network error", "error");
      }
      setSavingFuel(false);
      return;
    }
    const map: Record<string, string> = {};
    for (const r of data.config ?? []) {
      if (FUEL_CONFIG_KEYS.includes(r.key as typeof FUEL_CONFIG_KEYS[number])) {
        map[r.key] = r.value;
      }
    }
    setFuelServer(map);
    setFuelEdits({ ...map });
    toast.show("Fuel config saved", "success");
    setSavingFuel(false);
  };

  const handleSave = async () => {
    if (!hasChanges) {
      toast.show("No changes to save", "info");
      return;
    }
    const updates: { key: string; value: string }[] = [];
    for (const f of allFields) {
      if (!dirtyKeys.has(f.key)) continue;
      const val = edits[f.key] ?? "";
      if (f.type === "boolean") {
        updates.push({ key: f.key, value: val === "true" ? "true" : "false" });
      } else if (f.type === "number") {
        const n = Number(val);
        if (!Number.isFinite(n)) {
          toast.show(`${f.label} must be a number`, "error");
          return;
        }
        updates.push({ key: f.key, value: val });
      } else {
        updates.push({ key: f.key, value: val });
      }
    }
    if (updates.length === 0) return;
    setSaving(true);
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
      setSaving(false);
      return;
    }
    const map: Record<string, string> = {};
    for (const r of data.config ?? []) {
      if (allFields.some((f) => f.key === r.key)) map[r.key] = r.value;
    }
    setServerValues(map);
    const editsMap: Record<string, string> = {};
    for (const f of allFields) {
      if (map[f.key] !== undefined) editsMap[f.key] = map[f.key];
    }
    setEdits(editsMap);
    toast.show("Fare config saved", "success");
    setSaving(false);
  };

  const renderRateDisplay = (field: FieldDef) => {
    const cat = field.key.includes("bike")
      ? "bike"
      : field.key.includes("cng")
        ? "cng"
        : "car";
    const multiplier = Number(edits[field.key] ?? serverValues[field.key] ?? "0");
    const perKm = PER_KM_BDT[cat] ?? 0;
    const absoluteRate = Math.round(perKm * multiplier);
    return (
      <View key={field.key} style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <View style={styles.rateDisplay}>
          <Text style={styles.rateValue}>{absoluteRate} ৳/km</Text>
          <Text style={styles.rateNote}>
            (computed from base {perKm} ৳/km)
          </Text>
        </View>
        <Text style={styles.helpText}>{field.helpText}</Text>
      </View>
    );
  };

  const renderField = (field: FieldDef) => {
    if (field.type === "rateDisplay") return renderRateDisplay(field);

    if (serverValues[field.key] === undefined) {
      return (
        <View key={field.key} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Text style={styles.missingText}>
            Not present in DB — add via seed script.
          </Text>
        </View>
      );
    }

    if (field.type === "boolean") {
      const isOn = edits[field.key] === "true";
      return (
        <View key={field.key} style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>{field.label}</Text>
          <Pressable
            style={[
              styles.toggleTrack,
              isOn && styles.toggleTrackActive,
              field.locked && styles.btnDisabled,
            ]}
            onPress={() => {
              if (field.locked) return;
              setEdits((prev) => ({
                ...prev,
                [field.key]: isOn ? "false" : "true",
              }));
            }}
            disabled={field.locked}
            accessibilityRole="switch"
            accessibilityState={{ checked: isOn }}
          >
            <View
              style={[styles.toggleThumb, isOn && styles.toggleThumbActive]}
            />
          </Pressable>
          {field.key === "pickup_fee_enabled" && isOn && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                Requires calibrated radii. Ensure Stage 0 calibration data is
                sufficient before enabling.
              </Text>
            </View>
          )}
          <Text style={styles.helpText}>{field.helpText}</Text>
        </View>
      );
    }

    return (
      <View key={field.key} style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <TextInput
          style={[styles.input, field.locked && styles.inputLocked]}
          value={edits[field.key] ?? ""}
          onChangeText={(v) => {
            if (field.locked) return;
            setEdits((prev) => ({ ...prev, [field.key]: v }));
          }}
          editable={!field.locked}
          placeholder="0"
          placeholderTextColor={colors.textDisabledDark}
          keyboardType={field.type === "csv" ? "default" : "decimal-pad"}
        />
        <Text style={styles.helpText}>
          {field.helpText}
          {field.locked ? " (locked)" : ""}
        </Text>
      </View>
    );
  };

  const renderSection = (
    title: string,
    subtitle: string,
    fields: FieldDef[],
  ) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <View style={styles.formGrid}>{fields.map(renderField)}</View>
    </View>
  );

  return (
    <AdminShell
      title="Fare Configuration"
      subtitle="Pickup fee, dispatch levers, dawdle guard, and recalibration settings"
      actions={
        <>
          <Pressable
            style={[styles.ghostBtn, loading && styles.ghostBtnDisabled]}
            onPress={fetchConfig}
            disabled={loading}
          >
            <Text style={styles.ghostBtnText}>Refresh</Text>
          </Pressable>
          <Pressable
            style={[
              styles.saveBtn,
              (!hasChanges || saving) && styles.btnDisabled,
            ]}
            onPress={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save</Text>
            )}
          </Pressable>
        </>
      }
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.adminAccent} />
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {/* ── REV-6 + ROUND-13: Fare Engine Setup ── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Fare Engine Setup</Text>
                <Text style={styles.sectionSubtitle}>
                  Entry order: 1) Fuel prices 2) Tier data 3) Verify derived
                  rates. Pending fields (backstop, zone fees) are
                  Stage-0-gated by design.
                </Text>
              </View>
              {isEditor && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    style={styles.ghostBtn}
                    onPress={handleExportCsv}
                  >
                    <Text style={styles.ghostBtnText}>Export CSV</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, (!hasFuelChanges || savingFuel) && styles.btnDisabled]}
                    onPress={handleSaveFuel}
                    disabled={!hasFuelChanges || savingFuel}
                  >
                    {savingFuel ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save Fuel</Text>
                    )}
                  </Pressable>
                </View>
              )}
            </View>

            {/* G-2a: Fuel price banner */}
            <View style={styles.infoBanner}>
              <Text style={styles.infoBannerText}>
                Enter fuel prices BEFORE entering tier data — rates are derived
                from price × efficiency. If fuel prices change later, re-enter
                tier data to refresh derived rates (automatic refresh ships with
                the Stage 1 engine cutover).
              </Text>
            </View>

            {/* Fuel prices + efficiency + targets — editable for admin/owner, read-only for others */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.fieldLabel}>Fuel Prices (BDT/L or BDT/m³)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                {(
                  [
                    { key: "fuel_price_octane_bdt", label: "Octane (Car)" },
                    { key: "fuel_price_petrol_bdt", label: "Petrol (Bike)" },
                    { key: "fuel_price_cng_bdt", label: "CNG" },
                  ] as const
                ).map((f) => (
                  <View key={f.key} style={styles.fieldRow}>
                    <Text style={styles.fieldLabel}>{f.label}</Text>
                    {isEditor ? (
                      <TextInput
                        style={styles.input}
                        value={fuelEdits[f.key] ?? ""}
                        onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.key]: v }))}
                        placeholder="0"
                        placeholderTextColor={colors.textDisabledDark}
                        keyboardType="decimal-pad"
                      />
                    ) : (
                      <Text style={styles.fuelValue}>
                        {fuelEdits[f.key] ?? "—"} BDT/L
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>

            {/* Tier data: efficiency, maintenance, target, billed minutes — per category */}
            {isEditor && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.fieldLabel}>Tier Data</Text>
                <Text style={styles.helpText}>
                  Per-category fuel efficiency, driver maintenance, daily target,
                  expected billed minutes, and joma recovery.
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                  {/* Bike card — with per-tier joma overrides */}
                  <View style={styles.tierDataCard}>
                    <Text style={styles.fieldLabel}>Bike</Text>
                    {(
                      [
                        { fieldKey: "fuel_efficiency_bike_basic", label: "Efficiency (km/L)" },
                        { fieldKey: MAINT_KEY["bike"], label: "Maint (BDT/km)" },
                        { fieldKey: DAILY_TARGET_KEY["bike"], label: "Daily Target (BDT)" },
                        { fieldKey: BILLED_MINUTES_KEY["bike"], label: "Billed Minutes" },
                      ]
                    ).map((f) => (
                      <View key={f.fieldKey} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={styles.input}
                          value={fuelEdits[f.fieldKey] ?? ""}
                          onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.fieldKey]: v }))}
                          placeholder="0"
                          placeholderTextColor={colors.textDisabledDark}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <View style={{ height: 1, backgroundColor: "#2A2D35", marginVertical: 4 }} />
                    <Text style={styles.fieldLabel}>Joma Recovery (BDT/month)</Text>
                    {(
                      [
                        { fieldKey: "joma_monthly_bdt_bike_eco", label: "Eco (bike_basic)" },
                        { fieldKey: "joma_monthly_bdt_bike_std", label: "Standard (bike_standard)" },
                        { fieldKey: "joma_monthly_bdt_bike_prem", label: "Premium (bike_plus)" },
                      ]
                    ).map((f) => (
                      <View key={f.fieldKey} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={styles.input}
                          value={fuelEdits[f.fieldKey] ?? ""}
                          onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.fieldKey]: v }))}
                          placeholder="0"
                          placeholderTextColor={colors.textDisabledDark}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                  </View>

                  {/* CNG card — with joma daily */}
                  <View style={styles.tierDataCard}>
                    <Text style={styles.fieldLabel}>CNG</Text>
                    {(
                      [
                        { fieldKey: "fuel_efficiency_cng", label: "Efficiency (km/m³)" },
                        { fieldKey: MAINT_KEY["cng"], label: "Maint (BDT/km)" },
                        { fieldKey: DAILY_TARGET_KEY["cng"], label: "Daily Target (BDT)" },
                        { fieldKey: BILLED_MINUTES_KEY["cng"], label: "Billed Minutes" },
                      ]
                    ).map((f) => (
                      <View key={f.fieldKey} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={styles.input}
                          value={fuelEdits[f.fieldKey] ?? ""}
                          onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.fieldKey]: v }))}
                          placeholder="0"
                          placeholderTextColor={colors.textDisabledDark}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <View style={{ height: 1, backgroundColor: "#2A2D35", marginVertical: 4 }} />
                    <View style={styles.fieldRow}>
                      <Text style={styles.fieldLabel}>Joma (BDT/day)</Text>
                      <TextInput
                        style={styles.input}
                        value={fuelEdits["joma_daily_bdt_cng"] ?? ""}
                        onChangeText={(v) => setFuelEdits((p) => ({ ...p, joma_daily_bdt_cng: v }))}
                        placeholder="0"
                        placeholderTextColor={colors.textDisabledDark}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>

                  {/* Car card — per-vehicle-type efficiency + shared maint/target */}
                  <View style={styles.tierDataCard}>
                    <Text style={styles.fieldLabel}>Car</Text>
                    <Text style={styles.fieldLabel}>Fuel Efficiency per Type (km/L)</Text>
                    {(
                      [
                        { fieldKey: "fuel_efficiency_car_compact", label: "Compact" },
                        { fieldKey: "fuel_efficiency_car_economy", label: "Economy" },
                        { fieldKey: "fuel_efficiency_car_comfort", label: "Comfort" },
                        { fieldKey: "fuel_efficiency_car_premium", label: "Premium" },
                        { fieldKey: "fuel_efficiency_car_xl", label: "XL" },
                      ]
                    ).map((f) => (
                      <View key={f.fieldKey} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={styles.input}
                          value={fuelEdits[f.fieldKey] ?? ""}
                          onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.fieldKey]: v }))}
                          placeholder="0"
                          placeholderTextColor={colors.textDisabledDark}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <View style={{ height: 1, backgroundColor: "#2A2D35", marginVertical: 4 }} />
                    {(
                      [
                        { fieldKey: MAINT_KEY["car"], label: "Maint (BDT/km)" },
                        { fieldKey: DAILY_TARGET_KEY["car"], label: "Daily Target (BDT)" },
                        { fieldKey: BILLED_MINUTES_KEY["car"], label: "Billed Minutes" },
                      ]
                    ).map((f) => (
                      <View key={f.fieldKey} style={styles.fieldRow}>
                        <Text style={styles.fieldLabel}>{f.label}</Text>
                        <TextInput
                          style={styles.input}
                          value={fuelEdits[f.fieldKey] ?? ""}
                          onChangeText={(v) => setFuelEdits((p) => ({ ...p, [f.fieldKey]: v }))}
                          placeholder="0"
                          placeholderTextColor={colors.textDisabledDark}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                    <Text style={styles.helpText}>
                      Car joma uses 50% net back-solve — no separate field.
                    </Text>
                  </View>
                </View>

                {/* Shared: operating days per month */}
                <View style={{ marginTop: 8, width: 320, maxWidth: "100%" }}>
                  <Text style={styles.fieldLabel}>Operating Days per Month</Text>
                  <TextInput
                    style={styles.input}
                    value={fuelEdits["joma_operating_days_per_month"] ?? ""}
                    onChangeText={(v) => setFuelEdits((p) => ({ ...p, joma_operating_days_per_month: v }))}
                    placeholder="26"
                    placeholderTextColor={colors.textDisabledDark}
                    keyboardType="decimal-pad"
                  />
                  <Text style={styles.helpText}>
                    Used to convert monthly joma to per-km rate. Default 26.
                  </Text>
                </View>
              </View>
            )}

            {/* G-2c: Derived required-gross per vehicle type + spot-check prompt */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>Derived Rates per Vehicle Type</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {derivedVehicles.map((vt) => (
                  <View key={vt.vehicleType} style={styles.vehicleTypeCard}>
                    <Text style={styles.vehicleTypeLabel}>{vt.label}</Text>
                    <Text style={styles.vehicleTypeGross}>
                      ~৳{vt.requiredGrossBDT}/day
                    </Text>
                    <Text style={styles.vehicleTypeDetail}>
                      fuel ৳{formatPaisaTaka(vt.fuelPerKmPaisa)}/km · maint
                      ৳{formatPaisaTaka(vt.maintPerKmPaisa)}/km · target
                      ৳{vt.dailyTargetBDT}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.spotCheckPrompt}>
                Spot-check: Bike required gross should land near BDT ~1,680/day
                (owner 275 + target 850 + fuel/maintenance ~460). If the derived
                number is far off, re-check the entered values.
              </Text>
            </View>

            {/* G-2d: Pending-by-design field states */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>Stage-Gated Fields</Text>
              <View style={{ gap: 8, marginTop: 8 }}>
                <View style={styles.pendingFieldRow}>
                  <Text style={styles.pendingFieldLabel}>Backstop Cap (% of fare)</Text>
                  <View style={styles.pendingTag}>
                    <Text style={styles.pendingTagText}>
                      Requires Stage 0 calibration data — do not set a default.
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingFieldRow}>
                  <Text style={styles.pendingFieldLabel}>Churn Alarm Thresholds</Text>
                  <View style={styles.pendingTag}>
                    <Text style={styles.pendingTagText}>
                      Monitor thresholds — inactive until Stage 0 dashboard.
                    </Text>
                  </View>
                </View>
                <View style={styles.pendingFieldRow}>
                  <Text style={styles.pendingFieldLabel}>Zone-Fee Schedule</Text>
                  <View style={styles.pendingTag}>
                    <Text style={styles.pendingTagText}>
                      No zones learned yet — schedule unlocks after Stage 0
                      recovery data.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>

          {renderSection(
            "Pickup Fee Configuration",
            "Measurement toggle, fee master toggle, free radii, caps, and trace settings.",
            PICKUP_FIELDS,
          )}
          {renderSection(
            "Dispatch Levers",
            "Cold-drop boost, affinity, new-driver protection, and offer TTL.",
            DISPATCH_FIELDS,
          )}
          {renderSection(
            "Dawdle Guard & Recalibration",
            "Dawdle thresholds, escalation windows, and zone recalibration triggers.",
            DAWDLE_FIELDS,
          )}
        </View>
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  center: { padding: 40, alignItems: "center" },
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
  inputLocked: {
    opacity: 0.6,
  },
  rateDisplay: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rateValue: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 14,
  },
  rateNote: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
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
  warningBanner: {
    marginTop: 4,
    backgroundColor: "rgba(255, 183, 77, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 183, 77, 0.30)",
    borderRadius: 8,
    padding: 10,
  },
  warningText: {
    color: colors.amber,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    lineHeight: 16,
  },
  // REV-6: Fare engine setup section
  infoBanner: {
    backgroundColor: "rgba(12, 194, 95, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(12, 194, 95, 0.25)",
    borderRadius: 8,
    padding: 12,
  },
  infoBannerText: {
    color: colors.primary,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    lineHeight: 18,
  },
  fuelValue: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 13,
  },
  tierDataCard: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 12,
    width: 280,
    gap: 8,
  },
  vehicleTypeCard: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 10,
    width: 180,
    gap: 2,
  },
  vehicleTypeLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  vehicleTypeGross: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  vehicleTypeDetail: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 2,
  },
  spotCheckPrompt: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 10,
    lineHeight: 18,
  },
  // G-2d: Pending-by-design field states
  pendingFieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  pendingFieldLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 12,
    flexShrink: 1,
  },
  pendingTag: {
    backgroundColor: "rgba(255, 183, 77, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 183, 77, 0.25)",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingTagText: {
    color: colors.amber,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
  },
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
});
