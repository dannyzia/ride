import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface ErrorBannerProps {
  message: string;
  /** When provided, a Retry action is rendered next to the message. */
  onRetry?: () => void;
  /** Shows a spinner in place of the Retry label while a retry is in flight. */
  retrying?: boolean;
}

/**
 * §8.2 retryable error banner. Danger-tinted surface with an alert icon,
 * message, and an optional Retry action. No retry → message-only banner.
 */
const ErrorBanner = ({ message, onRetry, retrying = false }: ErrorBannerProps) => {
  const isDark = useIsDark();
  const bg = isDark ? "rgba(227, 29, 28, 0.12)" : colors.dangerLight;

  return (
    <View style={[styles.container, { backgroundColor: bg }]}>
      <Ionicons name="alert-circle" size={18} color={colors.danger} />
      <Text style={styles.message} numberOfLines={3}>
        {message}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Retry"
          onPress={onRetry}
          disabled={retrying}
          hitSlop={8}
          style={styles.action}
        >
          {retrying ? (
            <ActivityIndicator size={16} color={colors.danger} />
          ) : (
            <Text style={styles.actionText}>Retry</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  message: {
    flex: 1,
    fontFamily: "Jakarta-Regular",
    fontSize: 14,
    color: colors.danger,
  },
  action: {
    paddingLeft: 8,
    paddingVertical: 2,
  },
  actionText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
    color: colors.danger,
  },
});

export default ErrorBanner;
