import {
  Alert,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import SettingsRow from "@/components/SettingsRow";

const CHAT_ROUTE = "/(main)/(customer)/(tabs)/chat";
const SUPPORT_EMAIL = "support@ride.app.bd";
const SUPPORT_PHONE = process.env.EXPO_PUBLIC_SUPPORT_PHONE ?? "+880 1XXX-XXXXXX";

export default function SettingsContactSupport() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const openExternal = async (label: string, url: string) => {
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          "Unavailable",
          "No app is available to handle this request on your device."
        );
        return;
      }
      await Linking.openURL(url);
    } catch (err) {
      logger.error(`[settings/contact-support] failed to open ${label}`, err);
      Alert.alert(
        "Something went wrong",
        `Could not open ${label}. Please try again.`
      );
    }
  };

  const callEmergency = () => {
    Alert.alert(
      "Call Emergency: 999",
      "This will place a call to the national emergency number. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Call 999",
          style: "destructive",
          onPress: () => {
            void openExternal("emergency call", "tel:999");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={isDark ? "light-content" : "dark-content"}
      />
      <View style={[styles.header, { borderBottomColor: borderColor }]}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: textPrimary }]}>
          Contact Support
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          onPress={() => setTheme(isDark ? "light" : "dark")}
        >
          <Ionicons
            name={isDark ? "sunny-outline" : "moon-outline"}
            size={24}
            color={textPrimary}
          />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: textPrimary }]}>
          Support Channels
        </Text>
        <View style={[styles.card, { backgroundColor: surface }]}>
          <SettingsRow
            icon="chatbubble-ellipses-outline"
            label="Live Chat"
            onPress={() => router.push(CHAT_ROUTE)}
          />
          <SettingsRow
            icon="mail-outline"
            iconColor={colors.info}
            label="Email Support"
            onPress={() => {
              void openExternal("email", `mailto:${SUPPORT_EMAIL}`);
            }}
          />
          <SettingsRow
            icon="call-outline"
            iconColor={colors.checkGreen}
            label="Call Us"
            onPress={() => {
              void openExternal(
                "phone call",
                `tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`
              );
            }}
            isLast
          />
        </View>
        <Text style={[styles.channelHint, { color: textSecondary }]}>
          Email: {SUPPORT_EMAIL}
        </Text>
        <Text style={[styles.channelHint, { color: textSecondary }]}>
          Phone: {SUPPORT_PHONE}
        </Text>
        <Text
          style={[styles.sectionTitle, { color: textPrimary, marginTop: 32 }]}
        >
          Emergency
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Call Emergency 999"
          activeOpacity={0.8}
          onPress={callEmergency}
          style={[styles.emergencyButton, { backgroundColor: colors.danger }]}
        >
          <Ionicons name="warning" size={20} color={colors.white} />
          <Text style={styles.emergencyButtonText}>Call Emergency: 999</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  content: { padding: 16, paddingBottom: 32 },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 18,
    marginBottom: 12,
  },
  card: { borderRadius: 16, overflow: "hidden" },
  channelHint: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    marginTop: 12,
    marginLeft: 4,
  },
  emergencyButton: {
    minHeight: 56,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emergencyButtonText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 16,
    color: colors.white,
  },
});
