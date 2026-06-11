import { View, Text } from 'react-native';
import { colors, spacing, radii } from '@/theme/goRide';

interface FareRow {
  label: string;
  amount_bdt: number;
}

interface FareBreakdownSheetProps {
  fareBreakdown: Record<string, any>;
}

export default function FareBreakdownSheet({ fareBreakdown }: FareBreakdownSheetProps) {
  const rows: FareRow[] = [];

  if (fareBreakdown.base_fare_bdt != null) {
    rows.push({ label: 'Base fare', amount_bdt: fareBreakdown.base_fare_bdt });
  }
  if (fareBreakdown.distance_charge_bdt != null) {
    rows.push({ label: 'Distance charge', amount_bdt: fareBreakdown.distance_charge_bdt });
  }
  if (fareBreakdown.time_charge_bdt != null && fareBreakdown.time_charge_bdt > 0) {
    rows.push({ label: 'Time charge', amount_bdt: fareBreakdown.time_charge_bdt });
  }
  if (fareBreakdown.floor_fare_bdt != null && fareBreakdown.floor_fare_bdt > fareBreakdown.total_bdt) {
    // Only show floor if it's higher than the computed total (meaning floor applied)
    rows.push({ label: 'Minimum fare floor', amount_bdt: fareBreakdown.floor_fare_bdt });
  }
  if (fareBreakdown.preference_surcharge_bdt != null && fareBreakdown.preference_surcharge_bdt > 0) {
    rows.push({ label: 'Preferences', amount_bdt: fareBreakdown.preference_surcharge_bdt });
  }
  if (fareBreakdown.total_bdt != null) {
    rows.push({ label: 'Total', amount_bdt: fareBreakdown.total_bdt });
  }
  if (fareBreakdown.driver_net_bdt != null && fareBreakdown.driver_net_bdt !== fareBreakdown.total_bdt) {
    rows.push({ label: 'Driver receives', amount_bdt: fareBreakdown.driver_net_bdt });
  }

  if (rows.length === 0) return null;

  return (
    <View style={{
      backgroundColor: colors.bgLight,
      borderRadius: radii['2xl'],
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.borderLight,
    }}>
      <Text style={{
        fontSize: 16, fontFamily: 'Urbanist', fontWeight: '700',
        color: colors.textPrimaryLight, marginBottom: spacing.md,
      }}>
        Fare Breakdown
      </Text>
      {rows.map((row, i) => {
        const isTotal = row.label === 'Total';
        return (
          <View
            key={i}
            style={{
              flexDirection: 'row', justifyContent: 'space-between',
              alignItems: 'center', paddingVertical: 6,
              ...(isTotal ? {
                borderTopWidth: 1, borderTopColor: colors.borderLight,
                marginTop: spacing.xs, paddingTop: spacing.sm,
              } : {}),
            }}
          >
            <Text style={{
              fontSize: 14, fontFamily: isTotal ? 'Urbanist' : 'Inter',
              fontWeight: isTotal ? '700' : '400',
              color: isTotal ? colors.textPrimaryLight : colors.textSecondaryLight,
            }}>
              {row.label}
            </Text>
            <Text style={{
              fontSize: 14, fontFamily: 'Inter',
              fontWeight: isTotal ? '700' : '400',
              color: isTotal ? colors.primary : colors.textPrimaryLight,
            }}>
              ৳{(row.amount_bdt / 100).toFixed(0)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
