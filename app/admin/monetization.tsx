// Admin surface for the postpaid monetization lockout report (D7).
// Consumes GET /api/admin/monetization/locked-drivers (Item 22): currently
// locked drivers with reason, exposure, and per-reason aging, plus the
// registered_drivers_no_product count. The endpoint lands in Stage 3; until
// then this screen renders an empty state rather than claiming live data
// that does not exist yet (Copy Truth).
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminTable, type AdminColumn } from "@/components/admin/AdminTable";
import { adminFetch } from "@/lib/adminFetch";
import { colors } from "@/theme/goRide";

interface LockedDriverRow {
  driver_id: string;
  reason: string;
  exposure_paisa: number;
  aged_from: string;
  due_at: string | null;
  expires_at: string | null;
}

interface LockedDriversResponse {
  drivers: LockedDriverRow[];
  registered_drivers_no_product: number;
}

export default function MonetizationScreen() {
  const [data, setData] = useState<LockedDriversResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    adminFetch<LockedDriversResponse>("/api/admin/monetization/locked-drivers").then((result) => {
      if (!mounted) return;
      setLoading(false);
      if (result.error || !result.data) {
        // Endpoint lands in Stage 3 (Item 22): empty state until it exists.
        setData({ drivers: [], registered_drivers_no_product: 0 });
      } else {
        setData(result.data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const columns: AdminColumn<LockedDriverRow>[] = [
    { key: "driver_id", header: "Driver", width: 130 },
    { key: "reason", header: "Lock reason", width: 150 },
    { key: "exposure_paisa", header: "Exposure (৳)", width: 110, render: (row) => `৳${(row.exposure_paisa / 100).toFixed(2)}` },
    { key: "aged_from", header: "Since", width: 150 },
    { key: "due_at", header: "Due / Expires", width: 160, render: (row) => row.due_at ?? row.expires_at ?? "—" },
  ];

  const drivers = data?.drivers ?? [];
  const noProduct = data?.registered_drivers_no_product ?? 0;

  if (loading) {
    return (
      <AdminShell title="Monetization" subtitle="Driver obligations & lockouts">
        <ActivityIndicator style={styles.center} />
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Monetization" subtitle="Driver obligations & lockouts">
      <ScrollView style={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.statLabel}>Drivers with no product</Text>
          <Text style={styles.statValue}>{noProduct}</Text>
          <Text style={styles.statNote}>
            Registered drivers holding neither a subscription nor a commission
            enrollment — they receive no offers until they choose a product.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Currently locked drivers</Text>
          <AdminTable
            columns={columns}
            rows={drivers}
            rowKey={(row) => row.driver_id}
            loading={false}
            emptyMessage="No locked drivers"
          />
        </View>
        {drivers.length === 0 && !loading && (
          <Text style={styles.hint}>No drivers are currently dispatch-locked.</Text>
        )}
      </ScrollView>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20 },
  card: {
    backgroundColor: colors.surfaceElevatedDark,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  statLabel: { color: colors.textSecondaryDark, fontSize: 12, fontFamily: "Jakarta-SemiBold", marginBottom: 4 },
  statValue: { color: colors.textPrimaryDark, fontSize: 32, fontFamily: "Jakarta-Bold", marginBottom: 8 },
  statNote: { color: colors.textSecondaryDark, fontSize: 12, lineHeight: 18 },
  section: { marginBottom: 16 },
  sectionTitle: { color: colors.textPrimaryDark, fontSize: 14, fontFamily: "Jakarta-Bold", marginBottom: 8 },
  hint: { color: colors.textSecondaryDark, fontSize: 12, fontFamily: "Jakarta-Regular" },
  center: { paddingVertical: 40, alignSelf: "center" },
});
