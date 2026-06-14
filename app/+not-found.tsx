import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { colors, spacing } from "@/theme/goRide";
import { router } from "expo-router";
import { Platform } from "react-native";

const isWeb = Platform.OS === "web";

export default function NotFoundScreen() {
  const handleGoHome = () => {
    router.replace("/");
  };

  const handleGoAdmin = () => {
    router.replace("/admin/login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Page Not Found</Text>
      <Text style={styles.subtitle}>
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
          style={[styles.button, styles.secondaryButton]}
          onPress={handleGoAdmin}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryButtonText}>Admin</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgDark,
    padding: spacing.xl,
  },
  title: {
    color: colors.textPrimaryDark,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: spacing.md,
    fontFamily: "Jakarta-Bold",
  },
  subtitle: {
    color: colors.textSecondaryDark,
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
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  secondaryButtonText: {
    color: colors.textPrimaryDark,
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Jakarta-SemiBold",
  },
});