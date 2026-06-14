// Centered modal dialog for the admin panel.
// Closes on backdrop click and ESC (web only).
import { ReactNode, useEffect } from "react";
import { Modal, Pressable, View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";

interface AdminModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number; // px, default 560
  footer?: ReactNode;
}

export function AdminModal({
  visible,
  title,
  onClose,
  children,
  width = 560,
  footer,
}: AdminModalProps) {
  // ESC to close (web only).
  useEffect(() => {
    if (!visible || Platform.OS !== "web") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.dialog, { maxWidth: width }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <AntDesign name="close" size={20} color={colors.adminSubtle} />
            </Pressable>
          </View>
          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxHeight: "85%",
    backgroundColor: colors.darkSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2D35",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2A2D35",
  },
  title: {
    color: colors.textPrimaryDark,
    fontFamily: "Jakarta-Bold",
    fontSize: 16,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#2A2D35",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
});
