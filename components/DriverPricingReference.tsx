/**
 * DriverPricingReference — display-only v6 fare formula reference.
 *
 * Shows drivers how v6 fares are calculated, gated on fare_framework_stage >= stage1.
 * During stage0 the component renders nothing. During stage1+ it shows a collapsible
 * card with the v6 line-item formula: base, distance, time, waiting, pickup, zone.
 *
 * Props: none — fetches stage + pricing config on mount.
 * Auth: uses the driver's JWT (bearer token from supabase session).
 */
import { useCallback, useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme/goRide";

interface PricingData {
  vehicle_type: string;
  base_km: number;
  initiation_minutes: number;
  per_km_bdt: number;
  per_min_bdt: number;
  floor_length_km: number;
  floor_min: number;
  free_wait_minutes: number;
  platform_commission_percent: number;
  zone_fee_enabled: boolean;
}

interface PricingReferenceResponse {
  stage: string;
  visible: boolean;
  pricing: PricingData | null;
}

/** Paisa to ৳ display (integer paisa → decimal taka). */
function paisaToTaka(paisa: number): string {
  return `৳${(paisa / 100).toFixed(2)}`;
}

/** Human label for vehicle type. */
const VT_LABEL: Record<string, string> = {
  bike_basic: "Bike Basic",
  bike_standard: "Bike Standard",
  bike_plus: "Bike Plus",
  cng: "CNG",
  car_compact: "Car Compact",
  car_economy: "Car Economy",
  car_comfort: "Car Comfort",
  car_premium: "Car Premium",
  car_xl: "Car XL",
};

export default function DriverPricingReference() {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pricing, setPricing] = useState<PricingData | null>(null);
  const [stage, setStage] = useState<string>("stage0");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch(`${API_URL}/api/driver/pricing-reference`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;

      const body: PricingReferenceResponse = await res.json();
      setStage(body.stage);
      setVisible(body.visible);
      setPricing(body.pricing);
    } catch {
      setError("Failed to load pricing reference");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Gate: only show when stage >= stage1
  if (loading) return null;
  if (!visible || stage === "stage0") return null;
  if (error) return null;
  if (!pricing) return null;

  const vtLabel = VT_LABEL[pricing.vehicle_type] ?? pricing.vehicle_type;
  const kmRate = pricing.per_km_bdt;
  const timeRate = pricing.per_min_bdt;
  const freeWait = pricing.free_wait_minutes;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="pricetag-outline" size={16} color={colors.adminAccent} />
          <Text style={styles.headerTitle}>V6 Pricing Formula</Text>
          <View style={styles.stageBadge}>
            <Text style={styles.stageBadgeText}>{stage.toUpperCase()}</Text>
          </View>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={colors.textSecondaryDark}
        />
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {/* Vehicle type label */}
          <Text style={styles.vehicleLabel}>{vtLabel}</Text>

          {/* Formula breakdown */}
          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Base Fare</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                {pricing.base_km} km × {paisaToTaka(kmRate)}/km
              </Text>
              <Text style={styles.formulaResult}>
                {paisaToTaka(Math.round(kmRate * pricing.base_km))}
              </Text>
            </View>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                {pricing.initiation_minutes} min initiation × {paisaToTaka(timeRate)}/min
              </Text>
              <Text style={styles.formulaResult}>
                {paisaToTaka(Math.round(timeRate * pricing.initiation_minutes))}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Distance</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                trip_km × {paisaToTaka(kmRate)}/km
              </Text>
              <Text style={styles.formulaResult}>per km</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Time</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                trip_min × {paisaToTaka(timeRate)}/min × night_mult
              </Text>
              <Text style={styles.formulaResult}>per min</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Waiting</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                max(0, wait_min − {freeWait} free) × {paisaToTaka(timeRate)}/min
              </Text>
              <Text style={styles.formulaResult}>per min</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Pickup Fee</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                flat 1.0× rate, capped by % of trip fare
              </Text>
              <Text style={styles.formulaResult}>variable</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Zone Fee</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>
                {pricing.zone_fee_enabled
                  ? "monthly schedule per zone × vehicle category"
                  : "currently disabled (Stage 0 default)"}
              </Text>
              <Text style={styles.formulaResult}>
                {pricing.zone_fee_enabled ? "variable" : "৳0.00"}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Totals */}
          <View style={styles.formulaSection}>
            <Text style={styles.sectionLabel}>Totals</Text>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>Total fare</Text>
              <Text style={styles.formulaResultBold}>base + dist + time + wait + pickup + zone</Text>
            </View>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItem}>Platform commission</Text>
              <Text style={[styles.formulaResult, { color: colors.success }]}>0% (subscription)</Text>
            </View>
            <View style={styles.formulaRow}>
              <Text style={styles.formulaItemBold}>You receive</Text>
              <Text style={[styles.formulaResultBold, { color: colors.success }]}>
                100% of total
              </Text>
            </View>
          </View>

          {/* Floor note */}
          {pricing.floor_length_km > 0 && (
            <View style={styles.floorNote}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textSecondaryDark} />
              <Text style={styles.floorNoteText}>
                Minimum fare floor applies: base + {pricing.floor_length_km} km + {pricing.floor_min} min
              </Text>
            </View>
          )}

          {/* Night mult note */}
          {timeRate > 0 && (
            <View style={styles.floorNote}>
              <Ionicons name="moon-outline" size={14} color={colors.amber} />
              <Text style={styles.floorNoteText}>
                Night multiplier applies to time, waiting, and initiation terms only — never to distance or zone/pickup fees.
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2D35",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  stageBadge: {
    backgroundColor: "rgba(100, 181, 246, 0.15)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stageBadgeText: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 9,
    letterSpacing: 0.5,
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 4,
  },
  vehicleLabel: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  formulaSection: {
    paddingVertical: 6,
  },
  sectionLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  formulaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 2,
  },
  formulaItem: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    flex: 1,
  },
  formulaItemBold: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 12,
    flex: 1,
  },
  formulaResult: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    textAlign: "right",
  },
  formulaResultBold: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 12,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: "#2A2D35",
    marginVertical: 2,
  },
  floorNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: "rgba(100, 181, 246, 0.05)",
    borderRadius: 6,
  },
  floorNoteText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
  },
});
