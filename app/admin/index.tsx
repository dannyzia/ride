// Admin dashboard landing page. Uses the shared shell.
// The sidebar already enumerates all sections, so the body is just a welcome
// banner plus quick stats tiles we can wire up later.
import { View, Text, StyleSheet } from "react-native";
import { AdminShell } from "@/components/admin/AdminShell";
import { colors } from "@/theme/goRide";

export default function AdminDashboard() {
  return (
    <AdminShell title="Dashboard" subtitle="Operational overview">
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Welcome</Text>
        <Text style={styles.cardText}>
          Use the sidebar to navigate. Operations covers the driver approval
          queue, monitoring, and recovery. Catalogs holds packages, zones,
          pricing, and city boundaries. Programs covers incentives, promos,
          preferences, referrals, points, and vehicle models. Config holds
          platform settings and sample media.
        </Text>
      </View>
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.darkSecondary,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#2A2D35",
  },
  cardTitle: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
    marginBottom: 8,
  },
  cardText: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    lineHeight: 20,
  },
});
