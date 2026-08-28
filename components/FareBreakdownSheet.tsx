import { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radii } from '@/theme/goRide';
import { useIsDark } from '@/lib/useAppearance';

interface FareRow {
  label: string;
  amount_bdt: number;
}

interface FareBreakdownSheetProps {
  fareBreakdown: Record<string, any>;
}

export default function FareBreakdownSheet({ fareBreakdown }: FareBreakdownSheetProps) {
  const [expanded, setExpanded] = useState(false);
  const isDark = useIsDark();

  const detailRows: FareRow[] = [];

  if (fareBreakdown.base_fare_bdt != null) {
    detailRows.push({ label: 'Base fare', amount_bdt: fareBreakdown.base_fare_bdt });
  }
  if (fareBreakdown.distance_charge_bdt != null) {
    detailRows.push({ label: 'Distance charge', amount_bdt: fareBreakdown.distance_charge_bdt });
  }
  if (fareBreakdown.time_charge_bdt != null && fareBreakdown.time_charge_bdt > 0) {
    detailRows.push({ label: 'Time charge', amount_bdt: fareBreakdown.time_charge_bdt });
  }
  if (fareBreakdown.floor_fare_bdt != null && fareBreakdown.floor_fare_bdt > fareBreakdown.total_bdt) {
    detailRows.push({ label: 'Minimum fare floor', amount_bdt: fareBreakdown.floor_fare_bdt });
  }
  if (fareBreakdown.preference_surcharge_bdt != null && fareBreakdown.preference_surcharge_bdt > 0) {
    detailRows.push({ label: 'Preferences', amount_bdt: fareBreakdown.preference_surcharge_bdt });
  }
  if (fareBreakdown.driver_net_bdt != null && fareBreakdown.driver_net_bdt !== fareBreakdown.total_bdt) {
    detailRows.push({ label: 'Driver receives', amount_bdt: fareBreakdown.driver_net_bdt });
  }
  // Pickup fee (Phase H) — defensive reads on historical fare_breakdown JSONB
  if (fareBreakdown.pickup_fee_final_bdt != null && fareBreakdown.pickup_fee_final_bdt > 0) {
    detailRows.push({ label: 'Pickup fee', amount_bdt: fareBreakdown.pickup_fee_final_bdt });
  }
  // v6 Phase F: waiting charge from fare_breakdown (may differ from ride.wait_fee_bdt)
  if (fareBreakdown.waiting_charge_bdt != null && fareBreakdown.waiting_charge_bdt > 0) {
    detailRows.push({ label: 'Waiting charge', amount_bdt: fareBreakdown.waiting_charge_bdt });
  }
  // v6 Phase F: zone fee (100% to driver, not commission base)
  if (fareBreakdown.zone_fee_bdt != null && fareBreakdown.zone_fee_bdt > 0) {
    detailRows.push({ label: 'Zone fee', amount_bdt: fareBreakdown.zone_fee_bdt });
  }
  // v6 Phase F: night multiplier indicator (informational)
  if (fareBreakdown.night_mult_applied != null && fareBreakdown.night_mult_applied > 1.0) {
    detailRows.push({
      label: `Night surcharge (${((fareBreakdown.night_mult_applied - 1) * 100).toFixed(0)}%)`,
      amount_bdt: 0, // included in time/waiting charges above
    });
  }

  const totalRow: FareRow | null = fareBreakdown.total_bdt != null
    ? { label: 'Total', amount_bdt: fareBreakdown.total_bdt }
    : null;

  if (!totalRow && detailRows.length === 0) return null;

  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  return (
    <View style={{
      backgroundColor: bg,
      borderRadius: radii['2xl'],
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: borderColor,
    }}>
      {/* Total row — always visible, tap to expand */}
      <TouchableOpacity
        onPress={() => detailRows.length > 0 && setExpanded(!expanded)}
        activeOpacity={detailRows.length > 0 ? 0.7 : 1}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{
          fontSize: 16,
          fontFamily: 'Jakarta-Bold',
          color: textPrimary,
        }}>
          {totalRow ? 'Total' : 'Fare Breakdown'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {totalRow && (
            <Text style={{
              fontSize: 16,
              fontFamily: 'Jakarta-Bold',
              color: colors.primary,
            }}>
              ৳{(totalRow.amount_bdt / 100).toFixed(0)}
            </Text>
          )}
          {detailRows.length > 0 && (
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={textSecondary}
            />
          )}
        </View>
      </TouchableOpacity>

      {/* Detail rows — only when expanded */}
      {expanded && detailRows.length > 0 && (
        <View style={{ marginTop: spacing.md }}>
          <View style={{
            borderTopWidth: 1,
            borderTopColor: borderColor,
            paddingTop: spacing.sm,
          }}>
            {detailRows.map((row, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 6,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 14,
                    fontFamily: 'Jakarta-Regular',
                    color: textSecondary,
                  }}>
                    {row.label}
                  </Text>
                  {row.label === 'Pickup fee' && fareBreakdown.pickup_trueup_delta_bdt != null && fareBreakdown.pickup_trueup_delta_bdt !== 0 && (
                    <Text style={{
                      fontSize: 11,
                      fontFamily: 'Jakarta-Regular',
                      color: colors.amber,
                      marginTop: 2,
                    }}>
                      (adjusted for actual distance)
                    </Text>
                  )}
                </View>
                <Text style={{
                  fontSize: 14,
                  fontFamily: 'Jakarta-Regular',
                  color: textPrimary,
                }}>
                  ৳{(row.amount_bdt / 100).toFixed(0)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
