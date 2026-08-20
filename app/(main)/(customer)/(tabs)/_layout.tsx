import type { ReactNode } from "react";
import { colors } from "@/theme/goRide";
import { Tabs } from "expo-router";
import {
  Image,
  ImageSourcePropType,
  View,
  TouchableWithoutFeedback,
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import { icons } from "@/constants/data";
import { FloatingNavMenu } from "@/components/FloatingNavMenu";
import OfflineIndicator from "@/components/OfflineIndicator";
import { GestureHandlerRootView } from "react-native-gesture-handler";

const TabIcon = ({
  focused,
  source,
}: {
  focused: boolean;
  source: ImageSourcePropType;
}) => {
  return (
    <View className="flex-row justify-center items-center rounded-full">
      <View
        className={`rounded-full items-center justify-center ${focused ? "bg-goPrimary" : "bg-goBgLight"}`}
        style={{
          width: 48,
          height: 48,
          borderWidth: focused ? 0 : 1,
          borderColor: colors.borderLight,
        }}
      >
        <Image
          source={source}
          resizeMode="contain"
          style={{
            width: 24,
            height: 24,
            tintColor: focused ? colors.white : colors.textSecondaryLight,
          }}
        />
      </View>
    </View>
  );
};

const TabBarButton = ({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress?: (event: GestureResponderEvent) => void;
}) => {
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View className="flex-1 items-center justify-center">{children}</View>
    </TouchableWithoutFeedback>
  );
};

export default function TabsLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
      <OfflineIndicator />
      <Tabs
        initialRouteName="home/index"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondaryLight,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontFamily: "Jakarta-Regular",
            fontSize: 11,
            fontWeight: "600",
            marginTop: 4,
          },
          tabBarStyle: {
            display: "none",
          },
        }}
      >
        {[
          { name: "home/index", icon: icons.home, label: "Home" },
          { name: "rides/index", icon: icons.list, label: "Activity" },
          { name: "chat/index", icon: icons.chat, label: "Chat" },
          { name: "profile/index", icon: icons.profile, label: "Account" },
        ].map(({ name, icon, label }) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              headerShown: false,
              tabBarLabel: label,
              tabBarIcon: ({ focused }) => (
                <TabIcon focused={focused} source={icon} />
              ),
              tabBarButton: (props) => <TabBarButton {...props} />,
            }}
          />
        ))}
      </Tabs>
      <FloatingNavMenu variant="customer" />
    </View>
    </GestureHandlerRootView>
  );
}
