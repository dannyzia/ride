import { StyleSheet, Text, View, TouchableOpacity, Platform, StatusBar } from "react-native";
import { colors, spacing } from "@/theme/goRide";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

const isWeb = Platform.OS === "web";

export default function NotFoundScreen() {
  const isDark = useIsDark();
  const { setTheme } = useAppearance();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handleGoHome = () => {
    router.replace("/");
  };

  const handleGoAdmin = () => {
    router.replace("/admin/login");
  };

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <Text style={[styles.title, { color: textPrimary }]}>Page Not Found</Text>
      <Text style={[styles.subtitle, { color: textSecondary }]}>
        {isWeb
          ? "The page you're looking for doesn't exist."
          : "We couldn't find that screen."}
      </Text>
      <View style={styles.buttons}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton]}
          onPress={handleGoHome}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Go Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton, { backgroundColor: surfaceBg, borderColor }]}
          onPress={handleGoAdmin}
          activeOpacity={0.8}
        >
          <Text style={[styles.secondaryButtonText, { color: textPrimary }]}>Admin</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: spacing.md,
    fontFamily: "Jakarta-Bold",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: spacing["3xl"],
    fontFamily: "Jakarta-Regular",
  },
  buttons: {
    flexDirection: "row",
    gap: spacing.md,
  },
  button: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  primaryButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Jakarta-SemiBold",
  },
  secondaryButton: {
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Jakarta-SemiBold",
  },
});
