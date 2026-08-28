
import { View, Text, TouchableOpacity, Modal } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

const STORAGE_KEY = "pickup_fee_explainer_dismissed_v1";

interface PickupFeeExplainerSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function PickupFeeExplainerSheet({
  visible,
  onDismiss,
}: PickupFeeExplainerSheetProps) {
  const isDark = useIsDark();
  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  const handleDismiss = async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // non-blocking
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

          {/* Illustration: pickup pin → driver → route */}
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
                backgroundColor: colors.primaryLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="location" size={24} color={colors.primary} />
            </View>
            <View
              style={{
                flex: 1,
                height: 2,
                backgroundColor: colors.primary,
                opacity: 0.3,
              }}
            />
            <Ionicons name="car-outline" size={28} color={textSecondary} />
            <View
              style={{
                flex: 1,
                height: 2,
                backgroundColor: colors.primary,
                opacity: 0.3,
              }}
            />
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: colors.accentLight,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="navigate" size={24} color={colors.accent} />
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
            Pickup Fee
          </Text>

          {/* Fairness principle */}
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
            Drivers travel to reach you — this fee covers that distance. The
            exact amount is adjusted based on the actual pickup distance after
            your driver arrives.
          </Text>

          {/* Key points */}
          <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                You see an estimated range before booking
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                Final fee is based on real distance, not estimate
              </Text>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}
            >
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textSecondary,
                  flex: 1,
                }}
              >
                Downward adjustments always favor you
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

export async function shouldShowExplainer(): Promise<boolean> {
  try {
    const dismissed = await AsyncStorage.getItem(STORAGE_KEY);
    return dismissed !== "true";
  } catch {
    return false;
  }
}
