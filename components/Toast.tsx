// Imperative, non-blocking toast for mobile screens (Pattern A theming).
//
// Usage:
//   import { showToast, ToastHost } from "@/components/Toast";
//   showToast("Rating submitted");              // success (default)
//   showToast("Offer expired", "info");
//   showToast("Something failed", "error");
//
// Mount <ToastHost /> once at the root (app/_layout.tsx) so toasts survive
// screen navigation. Bottom-anchored (Android snackbar style) — deliberately
// avoids safe-area hooks so it works without a SafeAreaProvider ancestor.
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@/theme/goRide";

type ToastType = "success" | "info" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  info: "information-circle",
  error: "alert-circle",
};

const AUTO_DISMISS_MS = 2200;

let nextId = 1;
type Listener = (toast: Omit<ToastItem, "id">) => void;
let listener: Listener | null = null;

/** Imperatively show a toast. Safe to call from any screen or event handler. */
export function showToast(message: string, type: ToastType = "success") {
  listener?.({ message, type });
}

function ToastCard({
  item,
  onDone,
}: {
  item: ToastItem;
  onDone: (id: number) => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 8,
          duration: 160,
          useNativeDriver: true,
        }),
      ]).start(() => onDone(item.id));
    }, AUTO_DISMISS_MS);

    return () => clearTimeout(timer);
  }, [item.id, onDone, opacity, translateY]);

  const bg =
    item.type === "success"
      ? colors.primary
      : item.type === "error"
        ? colors.danger
        : colors.nearBlack;

  return (
    <Animated.View
      style={{ opacity, transform: [{ translateY }], marginBottom: spacing.sm }}
    >
      <TouchableOpacity
        accessibilityRole="alert"
        accessibilityLabel={item.message}
        onPress={() => onDone(item.id)}
        activeOpacity={0.9}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: spacing.sm,
          maxWidth: "90%",
          alignSelf: "center",
          backgroundColor: bg,
          borderRadius: radii.pill,
          paddingVertical: spacing.md,
          paddingHorizontal: spacing.lg,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        <Ionicons name={ICONS[item.type]} size={18} color={colors.white} />
        <Text
          style={{
            fontFamily: "Jakarta-SemiBold",
            fontSize: 14,
            color: colors.white,
          }}
        >
          {item.message}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

/** Host that renders active toasts. Mount once at the app root. */
export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    listener = (t) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, ...t }]);
    };
    return () => {
      listener = null;
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // The host sits above the screen content; a plain overlay must not swallow
  // touches meant for the screen underneath.
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: spacing["4xl"],
        alignItems: "center",
        zIndex: 9999,
      }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} onDone={dismiss} />
      ))}
    </View>
  );
}
