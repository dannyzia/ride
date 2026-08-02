import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface ZonePnLData {
  zoneId: string;
  zoneName: string;
  periodStart: string;
  periodEnd: string;
  totalRevenueBdt: number;
  totalSubsidyBdt: number;
  totalCommissionBdt: number;
  totalDriverPayoutBdt: number;
  netPlatformIncomeBdt: number;
  rideCount: number;
  entryCount: number;
}

type Period = "7d" | "30d" | "90d";

export default function ZonePnL() {
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);
  const [selectedZone, setSelectedZone] = useState<string>("");
  const [period, setPeriod] = useState<Period>("30d");
  const [pnl, setPnL] = useState<ZonePnLData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
  }, []);

  useEffect(() => {
    if (selectedZone) {
      fetchPnL();
    }
  }, [selectedZone, period]);

  const fetchZones = async () => {
    const res = await adminFetch<{ zones: { id: string; name: string; lifecycle_stage: string }[] }>("/api/admin/zone-pnl");
    if (res.data?.zones) {
      const zoneList = res.data.zones.map((z) => ({ id: z.id, name: z.name }));
      setZones(zoneList);
      if (!selectedZone && zoneList.length > 0) setSelectedZone(zoneList[0].id);
    }
  };

  const fetchPnL = async () => {
    setLoading(true);
    const res = await adminFetch<{ zone_pnl: ZonePnLData }>(
      `/api/admin/zone-pnl?zone_id=${selectedZone}&period=${period}`
    );
    if (res.data?.zone_pnl) setPnL(res.data.zone_pnl);
    setLoading(false);
  };

  const fmtBdt = (paisa: number) => (paisa / 100).toFixed(2);

  const periodDays = (p: Period) => {
    if (p === "7d") return 7;
    if (p === "90d") return 90;
    return 30;
  };
  const days = periodDays(period);
  const contribution = pnl
    ? ((pnl.totalRevenueBdt - pnl.totalSubsidyBdt - pnl.totalCommissionBdt) / 100).toFixed(2)
    : "—";

  return (
    <AdminShell title="Zone P&L" subtitle="Zone profitability dashboard">
      <ScrollView>
        <View style={styles.controlsRow}>
          <View style={styles.picker}>
            <Text style={styles.pickerLabel}>Zone</Text>
            {zones.map((z) => (
              <Pressable
                key={z.id}
                style={[
                  styles.pickerOption,
                  selectedZone === z.id && styles.pickerOptionSelected,
                ]}
                onPress={() => setSelectedZone(z.id)}
              >
                <Text
                  style={[
                    styles.pickerOptionText,
                    selectedZone === z.id && styles.pickerOptionTextSelected,
                  ]}
                >
                  {z.name}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.periodToggle}>
            {(["7d", "30d", "90d"] as Period[]).map((p) => (
              <Pressable
                key={p}
                style={[
                  styles.periodBtn,
                  period === p && styles.periodBtnActive,
                ]}
                onPress={() => setPeriod(p)}
              >
                <Text
                  style={[
                    styles.periodBtnText,
                    period === p && styles.periodBtnTextActive,
                  ]}
                >
                  {p.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.adminAccent} style={{ marginTop: 40 }} />
        ) : pnl ? (
          <>
            <View style={styles.cardsRow}>
              <View style={[styles.statCard, { borderLeftColor: colors.primary }]}>
                <Text style={styles.statLabel}>Revenue</Text>
                <Text style={styles.statValue}>৳{fmtBdt(pnl.totalRevenueBdt)}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.amber }]}>
                <Text style={styles.statLabel}>Subsidies</Text>
                <Text style={styles.statValue}>৳{fmtBdt(pnl.totalSubsidyBdt)}</Text>
              </View>
              <View style={[styles.statCard, { borderLeftColor: colors.checkGreen }]} >
                <Text style={styles.statLabel}>Net</Text>
                <Text style={styles.statValue}>৳{fmtBdt(pnl.netPlatformIncomeBdt)}</Text>
              </View>
            </View>

            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Date</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Days</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Rides</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Revenue</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Commission</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader]}>Subsidies</Text>
                <Text style={[styles.tableCell, styles.tableCellHeader, { textAlign: "right" }]}>Contribution</Text>
              </View>
              <View style={styles.tableRow}>
                <Text style={styles.tableCell}>
                  {new Date(pnl.periodStart).toLocaleDateString()} – {new Date(pnl.periodEnd).toLocaleDateString()}
                </Text>
                <Text style={styles.tableCell}>{days}</Text>
                <Text style={styles.tableCell}>{pnl.rideCount}</Text>
                <Text style={styles.tableCell}>৳{fmtBdt(pnl.totalRevenueBdt)}</Text>
                <Text style={styles.tableCell}>৳{fmtBdt(pnl.totalCommissionBdt)}</Text>
                <Text style={styles.tableCell}>৳{fmtBdt(pnl.totalSubsidyBdt)}</Text>
                <Text style={[styles.tableCell, { textAlign: "right" }]}>৳{contribution}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.emptyText}>No data for this zone/period.</Text>
        )}
      </ScrollView>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  controlsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
    alignItems: "flex-start",
  },
  picker: {
    flex: 1,
    backgroundColor: colors.darkSecondary,
    borderRadius: 8,
    padding: 8,
  },
  pickerLabel: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 4,
  },
  pickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginTop: 2,
  },
  pickerOptionSelected: {
    backgroundColor: colors.adminAccent,
  },
  pickerOptionText: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
  },
  pickerOptionTextSelected: {
    color: "#000",
    fontFamily: "Jakarta-Bold",
  },
  periodToggle: {
    flexDirection: "row",
    gap: 4,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.darkSecondary,
  },
  periodBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  periodBtnActive: {
    backgroundColor: colors.adminAccent,
  },
  periodBtnText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 12,
  },
  periodBtnTextActive: {
    color: "#000",
  },
  cardsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  statLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
  },
  statValue: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 24,
    marginTop: 4,
  },
  table: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.15)",
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  tableCell: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    flex: 1,
    minWidth: 60,
  },
  tableCellHeader: {
    fontFamily: "Jakarta-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    color: colors.textDisabledDark,
  },
  emptyText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 40,
  },
});
