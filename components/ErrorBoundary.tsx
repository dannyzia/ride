import React, { Component, type ReactNode } from "react";
import { View, Text, TouchableOpacity, Appearance, type ColorSchemeName } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { logger } from "@/lib/logger";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  colorScheme: ColorSchemeName;
}

/**
 * Global error boundary — catches unhandled render errors anywhere in the
 * component tree and shows a full-screen retry screen. Placed at the root
 * layout level so even splash/auth screens are covered.
 *
 * Class component required — React has no hook equivalent for error boundaries.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    colorScheme: Appearance.getColorScheme(),
  };

  private subscription: ReturnType<typeof Appearance["addChangeListener"]> | null = null;

  componentDidMount() {
    this.subscription = Appearance.addChangeListener(({ colorScheme }) => {
      this.setState({ colorScheme });
    });
  }

  componentWillUnmount() {
    this.subscription?.remove();
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error("[ErrorBoundary] unhandled render error", {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const isDark = this.state.colorScheme === "dark";
      const bg = isDark ? colors.bgDark : colors.bgLight;
      const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
      const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
      const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
      const borderColor = isDark ? colors.borderDark : colors.borderLight;

      return (
        <View
          style={{
            flex: 1,
            backgroundColor: bg,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
        >
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: `${colors.danger}1A`,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Ionicons name="warning" size={40} color={colors.danger} />
          </View>

          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 20,
              color: textPrimary,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Something went wrong
          </Text>

          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textSecondary,
              textAlign: "center",
              lineHeight: 20,
              marginBottom: 32,
            }}
          >
            An unexpected error occurred. You can try again or restart the app.
          </Text>

          {__DEV__ && this.state.error ? (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 11,
                color: textSecondary,
                textAlign: "center",
                marginBottom: 24,
                lineHeight: 16,
              }}
              numberOfLines={6}
            >
              {this.state.error.message}
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Retry"
            style={{
              backgroundColor: colors.primary,
              borderRadius: 100,
              paddingVertical: 14,
              paddingHorizontal: 40,
              minWidth: 160,
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="refresh" size={18} color={colors.white} />
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 16,
                  color: colors.white,
                }}
              >
                Try Again
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              // In dev: reload the app. In prod: this is a no-op — the user
              // should force-close and reopen.
              if (__DEV__) {
                try {
                   
                  const RNReload = require("react-native").DevSettings?.reload;
                  if (RNReload) RNReload();
                } catch {
                  // No-op — not available in production
                }
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Reload app"
            style={{
              marginTop: 16,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 100,
              borderWidth: 1,
              borderColor,
              backgroundColor: surfaceBg,
              minWidth: 160,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 14,
                color: textPrimary,
              }}
            >
              Restart App
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}
