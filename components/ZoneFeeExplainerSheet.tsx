/**
 * ZoneFeeExplainerSheet — first-ride explainer for zone fee.
 *
 * Shows once per user (gated on users.zone_fee_explained). Explains:
 * - What the zone fee is (flat monthly schedule, not a live multiplier)
 * - Why it exists (driver compensation for high-recovery-time zones)
 * - That it goes 100% to the driver
 *
 * On dismiss, calls POST /api/user/zone-fee-explained to set the flag.
 */
import { useState } from "react";
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { logger } from "@/lib/logger";

interface ZoneFeeExplainerSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function ZoneFeeExplainerSheet({
  visible,
  onDismiss,
}: ZoneFeeExplainerSheetProps) {
  const isDark = useIsDark();
  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleDismiss = async () => {
    // Mark as explained on the server (non-blocking)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await fetch(`${API_URL}/api/user/zone-fee-explained`, {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      }
    } catch (e: unknown) {
      logger.warn("[ZoneFeeExplainerSheet] failed to mark explained", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
    onDismiss();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleDismiss}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            backgroundColor: bg,
            borderTopLeftRadius: radii["3xl"],
            borderTopRightRadius: radii["3xl"],
            padding: spacing.xl,
            paddingBottom: spacing["4xl"],
          }}
        >
          {/* Handle bar */}
          <View
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: borderColor,
              alignSelf: "center",
              marginBottom: spacing.xl,
            }}
          />

          {/* Illustration: zone map icon */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.xl,
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: "rgba(100, 181, 246, 0.15)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="map-outline" size={24} color={colors.adminAccent} />
            </View>
            <View
              style={{
                flex: 1,
                height: 2,
                backgroundColor: colors.adminAccent,
                opacity: 0.3,
              }}
            />
            <Ionicons name="cash-outline" size={28} color={textSecondary} />
            <View
              style={{
                flex: 1,
                height: 2,
                backgroundColor: colors.adminAccent,
                opacity: 0.3,
              }}
            />
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.successLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="person-outline" size={24} color={colors.success} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 20,
              color: textPrimary,
              textAlign: "center",
              marginBottom: spacing.md,
            }}
          >
            Zone Fee
          </Text>

          {/* Explanation */}
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 15,
              color: textSecondary,
              textAlign: "center",
              lineHeight: 22,
              marginBottom: spacing.lg,
            }}
          >
            Some zones have a small flat fee that helps compensate drivers for
            longer recovery times. This fee is set monthly and goes{" "}
            <Text style={{ fontFamily: "Jakarta-Bold", color: textPrimary }}>
              100% to the driver
            </Text>
            .
          </Text>

          {/* Key points */}
          <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "rgba(100, 181, 246, 0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <Ionicons name="calendar-outline" size={14} color={colors.adminAccent} />
              </View>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                Published monthly — not a live multiplier, never surge
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.successLight,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <Ionicons name="heart-outline" size={14} color={colors.success} />
              </View>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                Supports fair driver compensation in high-demand areas
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: "rgba(245, 158, 11, 0.12)",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 2,
                }}
              >
                <Ionicons name="information-circle-outline" size={14} color={colors.amber} />
              </View>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                Currently disabled — you won't see this fee yet
              </Text>
            </View>
          </View>

          {/* Got it button */}
          <TouchableOpacity
            onPress={handleDismiss}
            style={{
              backgroundColor: colors.primary,
              borderRadius: radii.pill,
              paddingVertical: spacing.lg,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 16,
                color: colors.white,
              }}
            >
              Got it
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
