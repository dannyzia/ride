import { colors } from "@/theme/goRide";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { AntDesign } from "@expo/vector-icons";

const ADMIN_MENU = [
  {
    key: "verification",
    title: "Driver Verification",
    description: "Review and approve driver documents",
    icon: "checksquareo" as const,
    route: "/admin/verification",
  },
  {
    key: "packages",
    title: "Call Packages",
    description: "Manage subscription packages and pricing",
    icon: "database" as const,
    route: "/admin/packages",
  },
  {
    key: "zones",
    title: "Zones & Pricing",
    description: "Configure operational zones and fare pricing",
    icon: "enviromento" as const,
    route: "/admin/zones",
  },
  {
    key: "city-boundaries",
    title: "City Boundaries",
    description: "Manage intercity geo-fencing polygons",
    icon: "flag" as const,
    route: "/admin/city-boundaries",
  },
  {
    key: "configuration",
    title: "Configuration",
    description: "Manage platform configuration values",
    icon: "setting" as const,
    route: "/admin/configuration",
  },
];

export default function AdminDashboard() {
  const handleSignOut = async () => {
    const { supabase } = await import("@/lib/supabase");
    await supabase.auth.signOut();
    router.replace("/admin/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>Manage your Ride platform</Text>
          </View>
          <TouchableOpacity
            onPress={handleSignOut}
            style={styles.signOutBtn}
            activeOpacity={0.7}
          >
            <AntDesign name="logout" size={18} color={colors.adminSubtle} />
          </TouchableOpacity>
        </View>

        {/* Menu Cards */}
        {ADMIN_MENU.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => router.push(item.route as any)}
            style={styles.menuCard}
            activeOpacity={0.7}
          >
            <View style={styles.menuIconWrap}>
              <AntDesign name={item.icon} size={22} color={colors.adminAccent} />
            </View>
            <View style={styles.menuContent}>
              <Text style={styles.menuTitle}>{item.title}</Text>
              <Text style={styles.menuDesc}>{item.description}</Text>
            </View>
            <AntDesign name="right" size={16} color={colors.textDisabledDark} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.darkSurface,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Platform.OS === "web" ? 24 : 16,
    marginBottom: 32,
  },
  headerTitle: {
    color: colors.textPrimaryDark,
    fontSize: 26,
    fontWeight: "700",
    fontFamily: "Jakarta-Bold",
  },
  headerSubtitle: {
    color: colors.textSecondaryDark,
    fontSize: 14,
    marginTop: 4,
    fontFamily: "Jakarta-Regular",
  },
  signOutBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    padding: 12,
  },
  menuCard: {
    backgroundColor: "#1E1E24",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
  },
  menuIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(100, 181, 246, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    color: colors.textPrimaryDark,
    fontWeight: "600",
    fontSize: 16,
    fontFamily: "Jakarta-SemiBold",
  },
  menuDesc: {
    color: colors.textSecondaryDark,
    fontSize: 12,
    marginTop: 4,
    fontFamily: "Jakarta-Regular",
  },
});
