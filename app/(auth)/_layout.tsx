import { Stack, useSegments } from 'expo-router';
import { View, TouchableOpacity } from "react-native";
import { colors } from '@/theme/goRide';
import { useIsDark, useAppearance } from '@/lib/useAppearance';
import { Ionicons } from "@expo/vector-icons";

function ThemeToggle() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <TouchableOpacity
      onPress={() => setTheme(isDark ? "light" : "dark")}
      style={{
        position: "absolute",
        top: 50,
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: surfaceBg,
        borderWidth: 1,
        borderColor,
        zIndex: 100,
      }}
    >
      <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
    </TouchableOpacity>
  );
}

export default function AuthLayout() {
  const isDark = useIsDark();
  const segments = useSegments();
  // L3: splash screens get NO theme toggle — they follow system only.
  const isSplash = segments[segments.length - 1] === 'driver-splash';
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: isDark ? colors.bgDark : colors.bgLight },
          animation: 'slide_from_right',
        }}
      />
      {!isSplash && <ThemeToggle />}
    </View>
  );
}
