import React, { useEffect } from "react";
import { View, Text, TouchableOpacity, Platform, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

// W-1: the PortPos redirect target. Every payment-initiation route sends the
// user (or the in-app WebView) to `${serverUrl}/payment/success|failure` after
// checkout — those URLs 404'd before this screen existed, so every paying
// customer ended their purchase on an error page and believed the payment
// failed. This screen confirms the result and deep-links back into the app via
// the `ride://` scheme (app.config.js).

interface PaymentResultScreenProps {
  status: "success" | "failure";
}

const APP_SCHEME = "ride://";

export default function PaymentResultScreen({ status }: PaymentResultScreenProps) {
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const success = status === "success";

  // Auto-attempt the deep link after a few seconds (standalone mobile
  // browsers show an "Open in Ride?" prompt; the in-app WebView path is
  // already handled by PaymentWebView's status polling, so this is harmless
  // there). Failures are swallowed — the button below remains.
  useEffect(() => {
    const t = setTimeout(() => {
      Linking.openURL(APP_SCHEME).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const handleReturn = () => {
    Linking.openURL(APP_SCHEME).catch(() => {});
  };

  // On web, a custom scheme in a JS call does nothing in desktop browsers —
  // render a real anchor so mobile browsers still offer "open in app".
  if (Platform.OS === "web") {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-[24px]"
        style={{ backgroundColor: bg }}
      >
        <View
          className="w-full max-w-[420px] items-center rounded-[20px] px-[24px] py-[40px]"
          style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        >
          <Ionicons
            name={success ? "checkmark-circle" : "close-circle"}
            size={72}
            color={success ? colors.primary : colors.danger}
          />
          <Text
            className="mt-[16px] text-[22px] font-JakartaBold text-center"
            style={{ color: textPrimary }}
          >
            {success ? "Payment Successful" : "Payment Not Completed"}
          </Text>
          <Text
            className="mt-[8px] text-[14px] font-Jakarta text-center leading-[20px]"
            style={{ color: textSecondary }}
          >
            {success
              ? "Your payment was received. You can return to the Ride app."
              : "No money was charged. You can try again from the Ride app."}
          </Text>
          <a
            href={APP_SCHEME}
            style={{
              marginTop: spacing.xl,
              backgroundColor: colors.primary,
              padding: `${spacing.md}px ${spacing["2xl"]}px`,
              borderRadius: radii.pill,
              textDecoration: "none",
              color: colors.white,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            Return to Ride
          </a>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
      <View
        className="w-full items-center rounded-[20px] px-[24px] py-[40px]"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
      >
        <Ionicons
          name={success ? "checkmark-circle" : "close-circle"}
          size={72}
          color={success ? colors.primary : colors.danger}
        />
        <Text className="mt-[16px] text-[22px] font-JakartaBold text-center" style={{ color: textPrimary }}>
          {success ? "Payment Successful" : "Payment Not Completed"}
        </Text>
        <Text
          className="mt-[8px] text-[14px] font-Jakarta text-center leading-[20px]"
          style={{ color: textSecondary }}
        >
          {success
            ? "Your payment was received. You can return to the Ride app."
            : "No money was charged. You can try again from the Ride app."}
        </Text>
        <TouchableOpacity
          onPress={handleReturn}
          activeOpacity={0.8}
          className="mt-[24px]"
          style={{
            backgroundColor: colors.primary,
            paddingVertical: spacing.md,
            paddingHorizontal: spacing["2xl"],
            borderRadius: radii.pill,
          }}
        >
          <Text className="text-[15px] font-JakartaSemiBold" style={{ color: colors.white }}>
            Return to Ride
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
