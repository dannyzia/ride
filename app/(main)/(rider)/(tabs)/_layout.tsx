import { Tabs } from "expo-router";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import OfflineIndicator from "@/components/OfflineIndicator";

import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { useDriverStore } from "@/store/useDriverStore";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
    Home: "home",
    Earnings: "cash",
    Activity: "list",
    Wallet: "wallet",
    Profile: "person",
  };
  return (
    <View className="items-center justify-center" style={{ marginTop: 6 }}>
      <Ionicons
        name={icons[label] ?? "ellipse"}
        size={22}
        color={focused ? colors.primary : textSecondary}
      />
      <Text
        className="mt-0.5"
        style={{
          fontFamily: focused ? "Jakarta-Bold" : "Jakarta-Regular",
          fontSize: 10,
          color: focused ? colors.primary : textSecondary,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function WalletIcon({ focused }: { focused: boolean }) {
  const isDark = useIsDark();
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const activeSubscription = useDriverStore((s) => s.activeSubscription);

  return (
    <View className="items-center justify-center" style={{ marginTop: 6 }}>
      <View>
        <Ionicons
          name="wallet"
          size={22}
          color={focused ? colors.primary : textSecondary}
        />
        {/* Due badge — show when there's an active subscription with calls used */}
        {activeSubscription &&
          activeSubscription.calls_remaining !== -1 &&
          activeSubscription.daily_calls_used > 0 && (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -8,
                backgroundColor: colors.danger,
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 9,
                  color: colors.white,
                }}
              >
                {activeSubscription.daily_calls_used > 99
                  ? "99+"
                  : activeSubscription.daily_calls_used}
              </Text>
            </View>
          )}
      </View>
      <Text
        className="mt-0.5"
        style={{
          fontFamily: focused ? "Jakarta-Bold" : "Jakarta-Regular",
          fontSize: 10,
          color: focused ? colors.primary : textSecondary,
        }}
      >
        Wallet
      </Text>
    </View>
  );
}

export default function DriverTabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <OfflineIndicator />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              display: "none",
            },
            tabBarShowLabel: false,
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="earning/index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Earnings" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="activity/index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Activity" focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="wallet/index"
            options={{
              tabBarIcon: ({ focused }) => <WalletIcon focused={focused} />,
            }}
          />
          <Tabs.Screen
            name="profile/index"
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Profile" focused={focused} />,
            }}
          />
          {/* Settings is a push route, not a tab — hide from the tab bar */}
          <Tabs.Screen
            name="settings/index"
            options={{
              href: null,
            }}
          />
        </Tabs>
      </View>
  );
}
