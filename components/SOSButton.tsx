import React, { useState, useCallback, useRef, useEffect } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { enqueueSosAlert } from "@/lib/sosQueue";
import NetInfo from "@react-native-community/netinfo";

interface SOSContact {
  label: string;
  number: string;
}

interface SOSButtonProps {
  disabled?: boolean;
  /** Ride ID to attach to the SOS alert for admin dashboard correlation. */
  rideId?: string;
}

const SOS_API_URL = Constants.expoConfig?.extra?.serverUrl ?? "";

/** Cooldown in seconds after firing an SOS before the button re-enables. */
const SOS_COOLDOWN_SECONDS = 5;

export default function SOSButton({ disabled = false, rideId }: SOSButtonProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [contacts, setContacts] = useState<SOSContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [queued, setQueued] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isDark = useIsDark();

  // Cleanup cooldown interval on unmount
  useEffect(() => {
    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, []);

  const startCooldown = useCallback(() => {
    setCooldownRemaining(SOS_COOLDOWN_SECONDS);
    cooldownIntervalRef.current = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  const handleOpen = useCallback(async () => {
    // 5-second cooldown gate: prevent accidental double-taps
    if (cooldownRemaining > 0) {
      Alert.alert(
        "SOS Cooldown",
        `Please wait ${cooldownRemaining} second${cooldownRemaining !== 1 ? "s" : ""} before sending another SOS.`,
      );
      return;
    }
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

        // DIAL FIRST (T-1): the emergency call must never depend on a network
        // round-trip. The alert below is best-effort and must not block it.
        const phoneUrl = `tel:${contact.number}`;
        const canOpen = await Linking.canOpenURL(phoneUrl);
        if (canOpen) {
          await Linking.openURL(phoneUrl);
        } else {
          Alert.alert("SOS", `Call ${contact.label}: ${contact.number}`);
        }
        setVisible(false);

        // Fire the alert best-effort in the background — the sos_alerts row
        // feeds the admin SOS dashboard, but a failed fetch here must never
        // fail the call the user just made.
        // C-4 / SOS Queue: if offline, queue the alert for retry on reconnect
        // instead of silently dropping it.
        try {
          const net = await NetInfo.fetch();
          const isOnline = net.isConnected === true;
          if (!isOnline) {
            const result = await enqueueSosAlert({ lat, lng });
            if (result.queued) {
              setQueued(true);
              logger.info("[SOS] alert queued (offline)", { id: result.id, lat, lng });
            }
          } else {
            const { data: { session } } = await supabase.auth.getSession();
            const token = session?.access_token;
            if (token) {
              await fetch(`${SOS_API_URL}/api/sos/alert`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ lat, lng, ride_id: rideId }),
              }).catch(() => {});
            }
          }
        } catch {
          // Non-blocking
        }
        logger.info("[SOS] alert fired", { lat, lng, contact: contact.number });
        // Start cooldown after successful fire
        startCooldown();
      } catch (err) {
        logger.error("[SOS] error", err);
      } finally {
        setSending(false);
      }
    },
    [sending],
  );

  const handleDismiss = useCallback(() => {
    setVisible(false);
    setQueued(false);
  }, []);

  const isCooldownActive = cooldownRemaining > 0 || disabled;

  return (
    <>
      <TouchableOpacity
        onPress={handleOpen}
        disabled={isCooldownActive}
        activeOpacity={0.8}
        style={{
          position: "absolute",
          bottom: insets.bottom + spacing["2xl"],
          right: spacing.lg,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: isCooldownActive ? textDisabled : colors.danger,
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
        {cooldownRemaining > 0 ? (
          <Text
            style={{
              color: colors.white,
              fontFamily: "Jakarta-Bold",
              fontSize: 18,
              fontVariant: ["tabular-nums"],
            }}
          >
            {cooldownRemaining}
          </Text>
        ) : (
          <Ionicons name="shield" size={28} color={colors.white} />
        )}
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
            <Ionicons name="shield" size={24} color={colors.danger} />
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
                    <Ionicons name="call" size={20} color={colors.white} />
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
                    <Ionicons name="chevron-forward" size={24} color={textSecondary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          {queued && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginTop: spacing.sm,
                paddingVertical: spacing.sm,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                backgroundColor: colors.amberLight,
              }}
            >
              <Ionicons name="cloud-offline-outline" size={16} color={colors.amber} style={{ marginRight: spacing.xs }} />
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 13,
                  color: colors.amber,
                }}
              >
                Alert queued — will send when online
              </Text>
            </View>
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
