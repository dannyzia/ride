import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export type ErrorBannerType = "error" | "warning" | "info";

interface ErrorBannerProps {
  message: string;
  /** Visual severity variant. Defaults to "error". */
  type?: ErrorBannerType;
  /** When provided, a Retry action is rendered next to the message. */
  onRetry?: () => void;
  /** Shows a spinner in place of the Retry label while a retry is in flight. */
  retrying?: boolean;
}

const TYPE_CONFIG: Record<
  ErrorBannerType,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bgLight: string; bgDark: string }
> = {
  error: {
    icon: "alert-circle",
    color: colors.danger,
    bgLight: colors.dangerLight,
    bgDark: "rgba(227, 29, 28, 0.12)",
  },
  warning: {
    icon: "warning",
    color: colors.amber,
    bgLight: colors.amberLight,
    bgDark: "rgba(245, 158, 11, 0.12)",
  },
  info: {
    icon: "information-circle",
    color: colors.info,
    bgLight: colors.infoLight,
    bgDark: "rgba(46, 66, 165, 0.12)",
  },
};

/**
 * §8.2 retryable error banner. Tinted surface with an alert icon,
 * message, and an optional Retry action. Supports error/warning/info
 * variants with WCAG-compliant accessibility.
 */
const ErrorBanner = ({ message, type = "error", onRetry, retrying = false }: ErrorBannerProps) => {
  const isDark = useIsDark();
  const cfg = TYPE_CONFIG[type];
  const bg = isDark ? cfg.bgDark : cfg.bgLight;

  return (
    <View style={[styles.container, { backgroundColor: bg }]} accessibilityRole="alert">
      <Ionicons name={cfg.icon} size={18} color={cfg.color} />
      <Text style={[styles.message, { color: cfg.color }]} numberOfLines={3}>
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
            <ActivityIndicator size={16} color={cfg.color} />
          ) : (
            <Text style={[styles.actionText, { color: cfg.color }]}>Retry</Text>
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
  },
  action: {
    paddingLeft: 8,
    paddingVertical: 2,
  },
  actionText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 14,
  },
});

export default ErrorBanner;
