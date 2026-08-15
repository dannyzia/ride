import { View, Text, StatusBar, TouchableOpacity, Alert, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";
import CustomButton from "@/components/CustomButton";

function openAppSettings() {
  Linking.openSettings?.().catch(() => {
    Linking.openURL("app-settings:").catch(() => {});
  });
}

const showSettingsPrompt = (onProceed: () => void) => {
  Alert.alert(
    "Location Permission Needed",
    "Ride needs your location to find drivers near you. Please enable location access in Settings.",
    [
      { text: "Not Now", style: "cancel", onPress: onProceed },
      { text: "Open Settings", onPress: openAppSettings },
    ],
  );
};

export default function EnableLocation() {
  const isDark = useIsDark();
  const setTheme = useAppearance((s) => s.setTheme);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const navigateNext = () => router.replace("/(auth)/notifications-permission");

  const allow = async () => {
    const { status: existingStatus } = await Location.getForegroundPermissionsAsync();

    if (existingStatus === "granted") {
      navigateNext();
      return;
    }

    if (existingStatus === "denied") {
      showSettingsPrompt(navigateNext);
      return;
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      logger.warn("[enable-location] location permission not granted");
      showSettingsPrompt(navigateNext);
      return;
    }
    navigateNext();
  };

  const skip = () => navigateNext();

  return (
    <SafeAreaView className="flex-1 px-6" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Toggle theme"
        onPress={() => setTheme(isDark ? "light" : "dark")}
        style={{ position: "absolute", top: 50, right: 24, width: 48, height: 48, alignItems: "center", justifyContent: "center", zIndex: 10 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
      </TouchableOpacity>

      {/* Top spacer */}
      <View className="flex-1" />

      {/* Icon */}
      <View className="items-center mb-8">
        <View
          className="w-20 h-20 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "18" }}
        >
          <Ionicons name="location-outline" size={32} color={colors.primary} />
        </View>
      </View>

      {/* Title */}
      <Text
        className="text-[24px] font-JakartaBold text-center mb-3 px-4"
        style={{ color: textPrimary }}
      >
        Allow Ride to access your location
      </Text>

      {/* Description */}
      <Text
        className="text-[16px] font-Jakarta text-center px-6"
        style={{ color: textSecondary }}
      >
        We need your location to find drivers near you.
      </Text>

      {/* Bottom spacer */}
      <View className="flex-1" />

      {/* Buttons */}
      <View className="w-full pb-10 gap-3">
        <CustomButton
          title="Allow"
          onPress={allow}
        />
        <CustomButton
          title="Not Now"
          bgVariant="secondary"
          onPress={skip}
        />
      </View>
    </SafeAreaView>
  );
}
