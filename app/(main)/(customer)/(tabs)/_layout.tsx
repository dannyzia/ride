import { colors, spacing } from "@/theme/goRide";
import { Tabs } from "expo-router";
import {
  Image,
  ImageSourcePropType,
  View,
  TouchableWithoutFeedback,
} from "react-native";
import { icons } from "@/constants/data";

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
        className={`rounded-full items-center justify-center ${focused ? "bg-goAccent" : "bg-goBgLight"}`}
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

const TabBarButton = ({ children, onPress }: any) => {
  return (
    <TouchableWithoutFeedback onPress={onPress}>
      <View className="flex-1 items-center justify-center">{children}</View>
    </TouchableWithoutFeedback>
  );
};

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="home/index"
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondaryLight,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontFamily: "Inter",
          fontSize: 11,
          fontWeight: "600",
          marginTop: 4,
        },
        tabBarStyle: {
          backgroundColor: colors.surfaceLight,
          borderTopLeftRadius: spacing["2xl"],
          borderTopRightRadius: spacing["2xl"],
          paddingTop: spacing.sm,
          paddingBottom: spacing.md,
          height: 84,
          position: "absolute",
          borderTopWidth: 1,
          borderTopColor: colors.borderLight,
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 12,
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
  );
}
