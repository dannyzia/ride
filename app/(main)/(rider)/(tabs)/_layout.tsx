import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FloatingNavMenu } from "@/components/FloatingNavMenu";
import OfflineIndicator from "@/components/OfflineIndicator";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    Home: "home", Earning: "cash", Activity: "list", Wallet: "wallet", Profile: "person",
  };
  return (
    <View className="items-center justify-center">
      <Ionicons name={icons[label] ?? "ellipse"} size={20} color={focused ? colors.primary : textSecondary} />
      <Text
        className={`text-[10px] mt-0.5 ${focused ? "font-JakartaBold" : "font-Jakarta"}`}
        style={{ color: focused ? colors.primary : textSecondary }}
      >
        {label}
      </Text>
    </View>
  );
}

export default function DriverTabLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <Tabs screenOptions={{
        headerShown: false,
        tabBarStyle: {
          display: "none",
        },
        tabBarShowLabel: false,
      }}>
        <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }} />
        <Tabs.Screen name="earning/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Earning" focused={focused} /> }} />
        <Tabs.Screen name="activity/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} /> }} />
        <Tabs.Screen name="wallet/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Wallet" focused={focused} /> }} />
        <Tabs.Screen name="profile/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }} />
      </Tabs>
      <FloatingNavMenu variant="driver" />
      </View>
    </GestureHandlerRootView>
  );
}
