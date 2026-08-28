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
import { type VehicleTypeEnum, VEHICLE_TYPES } from "@/lib/vehicleTypes";

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

// ── REV-6: Fuel engine setup (G-2a / G-2c / G-2d) ──
// Fuel config keys fetched from platform_config for the setup banner.
const FUEL_DISPLAY_KEYS = [
  "fuel_price_octane_bdt",
  "fuel_price_petrol_bdt",
  "fuel_price_cng_bdt",
] as const;

// Tier categories for derived required-gross display.
// Each entry: label, vehicle types in that category, and which compute function.
interface TierDisplay {
  label: string;
  vehicleTypes: VehicleTypeEnum[];
  compute: (p: TierFuelParams) => { km_rate: number; time_rate: number };
  maintPerKm: number;
}

const TIER_DISPLAY: TierDisplay[] = [
  {
    label: "Bike",
    vehicleTypes: ["bike_basic", "bike_standard", "bike_plus"],
    compute: computeBikeOrCngRates,
    maintPerKm: 55,
  },
  {
    label: "CNG",
    vehicleTypes: ["cng"],
    compute: computeBikeOrCngRates,
    maintPerKm: 105,
  },
  {
    label: "Car",
    vehicleTypes: [
      "car_compact",
      "car_economy",
      "car_comfort",
      "car_premium",
      "car_xl",
    ],
    compute: computeCarRates,
    maintPerKm: 345,
  },
];

function formatPaisaTaka(paisa: number): string {
  return `${Math.round(paisa / 100)}`;
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

  // REV-6: Fuel config values fetched for the setup banner + derived rates.
  const [fuelValues, setFuelValues] = useState<Record<string, string>>({});

  const allFields = useMemo(
    () => [...PICKUP_FIELDS, ...DISPATCH_FIELDS, ...DAWDLE_FIELDS],
    [],
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    const { data, error, status } = await adminFetch<ConfigResponse>(
      "/api/admin/config",
      { method: "GET" },
    );
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
      if (FUEL_DISPLAY_KEYS.includes(r.key as typeof FUEL_DISPLAY_KEYS[number])) {
        fuelMap[r.key] = r.value;
      }
    }
    setServerValues(map);
    setFuelValues(fuelMap);
    const editsMap: Record<string, string> = {};
    for (const f of allFields) {
      if (map[f.key] !== undefined) {
        editsMap[f.key] = map[f.key];
      }
    }
    setEdits(editsMap);
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

  // REV-6 G-2c: Compute derived required-gross per tier from fuel config.
  const derivedTiers = useMemo(() => {
    return TIER_DISPLAY.map((tier) => {
      const params = getDefaultFuelParams(tier.vehicleTypes[0]);
      // Override fuel price from admin-entered values if available.
      const fuelKey =
        tier.label === "Bike"
          ? "fuel_price_petrol_bdt"
          : tier.label === "CNG"
            ? "fuel_price_cng_bdt"
            : "fuel_price_octane_bdt";
      const adminFuel = Number(fuelValues[fuelKey]);
      if (adminFuel > 0) {
        params.fuel_price_bdt_per_unit = Math.round(adminFuel * 100);
      }
      const rates = tier.compute(params);
      // required_gross ≈ fuel/km + maint/km + joma/km + target (paisa)
      const fuelPerKm = Math.round(
        (params.fuel_price_bdt_per_unit * 100) /
          params.fuel_efficiency_km_per_unit,
      );
      const jomaPerKmVal =
        tier.label === "Car"
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
        label: tier.label,
        vehicleTypes: tier.vehicleTypes,
        fuelPriceBDT: adminFuel > 0 ? adminFuel : params.fuel_price_bdt_per_unit / 100,
        fuelPerKmPaisa: fuelPerKm,
        maintPerKmPaisa: params.driver_maint_per_km,
        dailyTargetBDT: params.daily_target_bdt / 100,
        requiredGrossBDT: requiredGrossTaka,
      };
    });
  }, [fuelValues]);

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
          {/* ── REV-6: Fare Engine Setup (G-2a ordering hint + G-2c derived rates + G-2d pending states) ── */}
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

            {/* Fuel prices display (read-only, sourced from platform_config) */}
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
                    <Text style={styles.fuelValue}>
                      {fuelValues[f.key] ?? "—"} BDT/L
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* G-2c: Derived required-gross per tier + spot-check prompt */}
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>Derived Tier Rates (spot-check)</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                {derivedTiers.map((tier) => (
                  <View key={tier.label} style={styles.tierCard}>
                    <Text style={styles.tierLabel}>{tier.label}</Text>
                    <Text style={styles.tierValue}>
                      ~৳{tier.requiredGrossBDT}/day
                    </Text>
                    <Text style={styles.tierDetail}>
                      fuel ৳{formatPaisaTaka(tier.fuelPerKmPaisa)}/km + maint
                      ৳{formatPaisaTaka(tier.maintPerKmPaisa)}/km + target
                      ৳{tier.dailyTargetBDT}
                    </Text>
                    <Text style={styles.tierVehicleTypes}>
                      {tier.vehicleTypes
                        .map((v) =>
                          VEHICLE_TYPES.find((vt) => vt.key === v)?.display_en ?? v,
                        )
                        .join(", ")}
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
  tierCard: {
    backgroundColor: "#181A20",
    borderWidth: 1,
    borderColor: "#2A2D35",
    borderRadius: 8,
    padding: 12,
    width: 220,
    gap: 4,
  },
  tierLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  tierValue: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  tierDetail: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 2,
  },
  tierVehicleTypes: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 10,
    marginTop: 4,
    fontStyle: "italic",
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
