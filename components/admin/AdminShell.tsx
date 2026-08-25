// Sidebar + main content shell used by every admin screen.
// On web (>=1024px), sidebar is fixed left. On narrow screens, the sidebar
// collapses into a drawer triggered by a hamburger button in the topbar.
//
// Each admin screen wraps its body in <AdminShell title="...">{...}</AdminShell>.
import { ReactNode, useEffect, useState } from "react";
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, usePathname } from "expo-router";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { teardownAdminSocket } from "@/lib/adminSocket";
import { authCleanup } from "@/lib/authCleanup";
import { colors } from "@/theme/goRide";

interface NavItem {
  route: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  group: "Operations" | "Catalogs" | "Programs" | "Config" | "Finance";
}

const NAV: NavItem[] = [
  // Operations
  {
    route: "/admin/queue",
    label: "Driver Queue",
    icon: "account-clock",
    group: "Operations",
  },
  {
    route: "/admin/monitoring",
    label: "Monitoring",
    icon: "chart-line",
    group: "Operations",
  },
  {
    route: "/admin/recovery",
    label: "Recovery",
    icon: "alert-circle",
    group: "Operations",
  },

  // Catalogs
  {
    route: "/admin/packages",
    label: "Call Packages",
    icon: "package-variant-closed",
    group: "Catalogs",
  },
  {
    route: "/admin/zones",
    label: "Zones",
    icon: "map-marker-radius",
    group: "Catalogs",
  },
  {
    route: "/admin/pricing",
    label: "Pricing",
    icon: "currency-bdt",
    group: "Catalogs",
  },
  {
    route: "/admin/city-boundaries",
    label: "City Boundaries",
    icon: "map-outline",
    group: "Catalogs",
  },

  // Trust & Safety
  {
    route: "/admin/lost-items",
    label: "Lost Items",
    icon: "magnify-close",
    group: "Operations",
  },
  {
    route: "/admin/fare-disputes",
    label: "Fare Disputes",
    icon: "scale-balance",
    group: "Operations",
  },

  // Programs
  {
    route: "/admin/incentives",
    label: "Incentives",
    icon: "trophy",
    group: "Programs",
  },
  {
    route: "/admin/promos",
    label: "Promo Codes",
    icon: "ticket-percent",
    group: "Programs",
  },
  {
    route: "/admin/preferences",
    label: "Preferences",
    icon: "tune-vertical",
    group: "Programs",
  },
  {
    route: "/admin/referral-campaigns",
    label: "Referral Campaigns",
    icon: "account-multiple-plus",
    group: "Programs",
  },
  {
    route: "/admin/point-offers",
    label: "Point Offers",
    icon: "star-circle",
    group: "Programs",
  },
  {
    route: "/admin/events",
    label: "Events",
    icon: "calendar-star",
    group: "Programs",
  },
  {
    route: "/admin/vehicle-models",
    label: "Vehicle Models",
    icon: "car-multiple",
    group: "Programs",
  },

  // Config
  {
    route: "/admin/ride-passes",
    label: "Ride Passes",
    icon: "ticket-account",
    group: "Catalogs",
  },
  {
    route: "/admin/broadcast",
    label: "Broadcast",
    icon: "bullhorn",
    group: "Operations",
  },

  // Finance
  {
    route: "/admin/tax-dashboard",
    label: "Tax Dashboard",
    icon: "file-chart",
    group: "Finance",
  },
  {
    route: "/admin/zone-pnl",
    label: "Zone P&L",
    icon: "chart-pie",
    group: "Finance",
  },
  {
    route: "/admin/pickup-analytics",
    label: "Pickup Analytics",
    icon: "chart-bar",
    group: "Finance",
  },

  // Operations — Fare Framework
  {
    route: "/admin/heat-monitor",
    label: "Heat Monitor",
    icon: "fire",
    group: "Operations",
  },
  {
    route: "/admin/trust-safety",
    label: "Trust & Safety",
    icon: "shield-check",
    group: "Operations",
  },

  {
    route: "/admin/platform-config",
    label: "Platform Config",
    icon: "cog",
    group: "Config",
  },
  {
    route: "/admin/fare-config",
    label: "Fare Config",
    icon: "cash-multiple",
    group: "Config",
  },
  {
    route: "/admin/sample-media",
    label: "Sample Media",
    icon: "image-multiple",
    group: "Config",
  },
];

const GROUP_ORDER: NavItem["group"][] = [
  "Operations",
  "Catalogs",
  "Programs",
  "Finance",
  "Config",
];

interface AdminShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode; // right-aligned buttons in topbar
  children: ReactNode;
}

export function AdminShell({
  title,
  subtitle,
  actions,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [width, setWidth] = useState(Dimensions.get("window").width);

  useEffect(() => {
    const handler = () => setWidth(Dimensions.get("window").width);
    const sub = Dimensions.addEventListener("change", handler);
    return () => sub.remove();
  }, []);

  const isDesktop = width >= 1024;

  const handleSignOut = async () => {
    // Kill the admin WS singleton before the session dies — otherwise it
    // keeps receiving SOS broadcasts and reconnecting with a dead token
    // (audit H-1 parity).
    teardownAdminSocket();
    await authCleanup();
    await supabase!.auth.signOut();
    router.replace("/admin/login");
  };

  const sidebar = (
    <ScrollView
      style={styles.sidebarScroll}
      contentContainerStyle={{ paddingVertical: 16, paddingBottom: 40 }}
    >
      <View style={styles.sidebarHeader}>
        <Text style={styles.brand}>Ride Admin</Text>
      </View>

      {GROUP_ORDER.map((group) => {
        const items = NAV.filter((n) => n.group === group);
        if (!items.length) return null;
        return (
          <View key={group} style={styles.navGroup}>
            <Text style={styles.navGroupTitle}>{group}</Text>
            {items.map((item) => {
              const isActive = pathname === item.route;
              return (
                <Pressable
                  key={item.route}
                  onPress={() => {
                    router.push(item.route as `/admin${string}`);
                    setDrawerOpen(false);
                  }}
                  style={[styles.navItem, isActive && styles.navItemActive]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={18}
                    color={
                      isActive ? colors.adminAccent : colors.textSecondaryDark
                    }
                  />
                  <Text
                    style={[
                      styles.navItemLabel,
                      isActive && styles.navItemLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      <Pressable style={styles.signOutBtn} onPress={handleSignOut}>
        <AntDesign name="logout" size={16} color={colors.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {isDesktop ? <View style={styles.sidebarDesktop}>{sidebar}</View> : null}

      {!isDesktop && drawerOpen ? (
        <Pressable style={styles.backdrop} onPress={() => setDrawerOpen(false)}>
          <View
            style={styles.sidebarDrawer}
            onStartShouldSetResponder={() => true}
          >
            {sidebar}
          </View>
        </Pressable>
      ) : null}

      <View style={styles.main}>
        <View style={styles.topbar}>
          {!isDesktop ? (
            <Pressable
              onPress={() => setDrawerOpen(true)}
              hitSlop={12}
              style={styles.hamburger}
            >
              <AntDesign name="bars" size={22} color={colors.textPrimaryDark} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {actions}
        </View>
        <ScrollView
          style={styles.content}
          contentContainerStyle={{
            padding: 20,
            maxWidth: 1400,
            width: "100%",
            alignSelf: "center",
          }}
        >
          {children}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.darkSurface,
  },
  sidebarDesktop: {
    width: 260,
    backgroundColor: "#181A20",
    borderRightWidth: 1,
    borderRightColor: "#2A2D35",
  },
  sidebarDrawer: { width: 280, backgroundColor: "#181A20", height: "100%" },
  sidebarScroll: { flex: 1 },
  sidebarHeader: { paddingHorizontal: 20, paddingVertical: 16 },
  brand: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  navGroup: { paddingHorizontal: 12, marginBottom: 14 },
  navGroupTitle: {
    color: colors.textDisabledDark,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
  },
  navItemActive: { backgroundColor: "rgba(100, 181, 246, 0.10)" },
  navItemLabel: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  navItemLabelActive: {
    color: colors.adminAccent,
    fontFamily: "Jakarta-SemiBold",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 12,
  },
  signOutText: {
    color: colors.danger,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
  main: { flex: 1 },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "#181A20",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  hamburger: { padding: 4 },
  title: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 18,
  },
  subtitle: {
    color: colors.textSecondaryDark,
    fontFamily: "Jakarta-Regular",
    fontSize: 12,
    marginTop: 2,
  },
  content: { flex: 1 },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    zIndex: 100,
  },
});
