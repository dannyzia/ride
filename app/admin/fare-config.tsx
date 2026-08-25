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
    helpText: "Number of priority leads. 0 = off until ops sets.",
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
    for (const r of data.config ?? []) {
      if (allFields.some((f) => f.key === r.key)) map[r.key] = r.value;
    }
    setServerValues(map);
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
