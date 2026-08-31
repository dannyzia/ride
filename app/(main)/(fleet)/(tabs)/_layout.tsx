/**
 * Fleet 4-tab bottom navigation: Dashboard | Operations | Finance | More.
 * Default tab bar hidden — FleetTabBar component handles rendering.
 */
import { Tabs } from "expo-router";
import { View } from "react-native";

export default function FleetTabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: "none" },
          tabBarShowLabel: false,
        }}
      >
        <Tabs.Screen name="dashboard/index" />
        <Tabs.Screen name="operations/index" />
        <Tabs.Screen name="finance/index" />
        <Tabs.Screen name="more/index" />
      </Tabs>
    </View>
  );
}
