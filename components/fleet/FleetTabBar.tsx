/**
 * FleetTabBar — custom bottom tab bar for the fleet layout.
 * 4 tabs: Dashboard, Operations, Finance, More.
 * Uses router.push for navigation (not tab navigation).
 */
import { View, Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const TABS = [
  { label: "Dashboard", icon: "grid" as const, path: "/(main)/(fleet)/(tabs)/dashboard" },
  { label: "Operations", icon: "car-sport" as const, path: "/(main)/(fleet)/(tabs)/operations" },
  { label: "Finance", icon: "cash" as const, path: "/(main)/(fleet)/(tabs)/finance" },
  { label: "More", icon: "ellipsis-horizontal" as const, path: "/(main)/(fleet)/(tabs)/more" },
];

export default function FleetTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDark = useIsDark();
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: surfaceBg,
        borderTopWidth: 1,
        borderTopColor: borderColor,
        paddingBottom: insets.bottom || 8,
        paddingTop: 8,
      }}
    >
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.path);
        return (
          <TouchableOpacity
            key={tab.label}
            onPress={() => router.push(tab.path)}
            style={{ flex: 1, alignItems: "center" }}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab.icon}
              size={22}
              color={active ? colors.primary : textSecondary}
            />
            <Text
              style={{
                marginTop: 2,
                fontFamily: active ? "Jakarta-Bold" : "Jakarta-Regular",
                fontSize: 10,
                color: active ? colors.primary : textSecondary,
              }}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
