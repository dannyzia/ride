import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import ReactNativeModal from "react-native-modal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { colors, spacing, radii } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";

interface SOSContact {
  label: string;
  number: string;
}

interface SOSButtonProps {
  disabled?: boolean;
}

const SOS_API_URL = Constants.expoConfig?.extra?.serverUrl ?? "";

export default function SOSButton({ disabled = false }: SOSButtonProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const handleOpen = useCallback(async () => {
    setVisible(true);
    setLoading(true);
    try {
      const res = await fetch(`${SOS_API_URL}/api/sos/contacts`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts ?? []);
      } else {
        setContacts([{ label: "National Emergency", number: "999" }]);
      }
    } catch {
      setContacts([{ label: "National Emergency", number: "999" }]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelectContact = useCallback(
    async (contact: SOSContact) => {
      if (sending) return;
      setSending(true);
      try {
        let lat = 0;
        let lng = 0;
        try {
          const { status } = await Location.getForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          }
        } catch {
          // Location unavailable
        }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          Alert.alert("Error", "Not authenticated. Please log in again.");
          return;
        }

        const res = await fetch(`${SOS_API_URL}/api/driver/sos-alert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ lat, lng }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          Alert.alert("Error", err.message ?? "Failed to send SOS alert.");
          return;
        }

        logger.info("[SOS] alert sent", { lat, lng, contact: contact.number });
        setVisible(false);
        const phoneUrl = `tel:${contact.number}`;
        const canOpen = await Linking.canOpenURL(phoneUrl);
        if (canOpen) {
          await Linking.openURL(phoneUrl);
        } else {
          Alert.alert("SOS", `Call ${contact.label}: ${contact.number}`);
        }
      } catch (err) {
        logger.error("[SOS] error", err);
        Alert.alert("Error", "Failed to send SOS. Please try again.");
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  const handleDismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        disabled={disabled}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          bottom: insets.bottom + spacing["2xl"],
          right: spacing.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: disabled ? textDisabled : colors.danger,
          justifyContent: "center",
          alignItems: "center",
          shadowColor: colors.black,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
          zIndex: 100,
        }}
      >
        <MaterialIcons name="shield" size={28} color={colors.white} />
      </TouchableOpacity>

      <ReactNativeModal
        isVisible={visible}
        onBackdropPress={handleDismiss}
        onSwipeComplete={handleDismiss}
        swipeDirection="down"
        style={{ justifyContent: "flex-end", margin: 0 }}
      >
        <View
          style={{
            backgroundColor: surfaceBg,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            maxHeight: 400,
          }}
        >
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: borderColor,
              alignSelf: "center",
              marginBottom: spacing.lg,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.lg }}>
            <MaterialIcons name="shield" size={24} color={colors.danger} />
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 18,
                color: textPrimary,
                marginLeft: spacing.sm,
              }}
            >
              Emergency Contacts
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={colors.danger} />
          ) : contacts.length === 0 ? (
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 14,
                color: textSecondary,
                textAlign: "center",
                paddingVertical: spacing.xl,
              }}
            >
              No emergency contacts configured.
            </Text>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectContact(item)}
                  disabled={sending}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: spacing.md,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.lg,
                    backgroundColor: colors.primaryLight,
                    marginBottom: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.danger,
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: spacing.md,
                    }}
                  >
                    <MaterialIcons name="phone" size={20} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Jakarta-Bold",
                        fontSize: 16,
                        color: textPrimary,
                      }}
                    >
                      {item.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Jakarta-Regular",
                        fontSize: 14,
                        color: textSecondary,
                      }}
                    >
                      {item.number}
                    </Text>
                  </View>
                  {sending ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <MaterialIcons name="chevron-right" size={24} color={textSecondary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          <TouchableOpacity
            onPress={handleDismiss}
            disabled={sending}
            activeOpacity={0.7}
            style={{
              marginTop: spacing.md,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              borderWidth: 1,
              borderColor: borderColor,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 15,
                color: textSecondary,
              }}
            >
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </ReactNativeModal>
    </>
  );
}
