import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { colors } from "@/theme/goRide";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "🏠", Earning: "💰", Activity: "📋", Wallet: "👛", Profile: "👤",
  };
  return (
    <View className="items-center justify-center">
      <Text style={{ fontSize: 20 }}>{icons[label] ?? "●"}</Text>
      <Text className={`text-[10px] mt-0.5 ${focused ? "font-JakartaBold text-goPrimary" : "font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark"}`}>
        {label}
      </Text>
    </View>
  );
}

export default function DriverTabLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: colors.surfaceElevatedDark,
        borderTopColor: colors.borderDark,
        borderTopWidth: 1,
        height: 65,
        paddingBottom: 8,
        paddingTop: 4,
      },
      tabBarShowLabel: false,
    }}>
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} /> }} />
      <Tabs.Screen name="earning/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Earning" focused={focused} /> }} />
      <Tabs.Screen name="activity/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} /> }} />
      <Tabs.Screen name="wallet/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Wallet" focused={focused} /> }} />
      <Tabs.Screen name="profile/index" options={{ tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} /> }} />
    </Tabs>
  );
}
