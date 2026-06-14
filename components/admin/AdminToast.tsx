// Imperative toast notification system for the admin panel.
// Usage:
//   const toast = useAdminToast();
//   toast.show("Saved", "success");
//
// Or push directly via the module-level emitter (used outside React trees).
import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "@/theme/goRide";

export type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;
// Module-level emitter allows non-React code to push toasts.
type ToastListener = (toast: Omit<Toast, "id">) => void;
let externalListener: ToastListener | null = null;
export function pushToast(message: string, type: ToastType = "info") {
  if (externalListener) externalListener({ message, type });
}

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Subscribe external emitters.
  useEffect(() => {
    externalListener = (t) => show(t.message, t.type);
    return () => {
      externalListener = null;
    };
  }, [show]);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            style={[styles.toast, styles[`toast_${t.type}`]]}
          >
            <Text style={styles.text}>{t.message}</Text>
          </Pressable>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useAdminToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback so screens can render before provider mounts.
    return { show: (msg, type) => pushToast(msg, type) };
  }
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
    maxWidth: 380,
  },
  toast: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  toast_success: { backgroundColor: colors.primary },
  toast_error: { backgroundColor: colors.danger },
  toast_info: { backgroundColor: colors.adminAccent },
  toast_warning: { backgroundColor: colors.amber },
  text: {
    color: colors.white,
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
  },
});
