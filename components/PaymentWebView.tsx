import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import { useAppearance } from "@/lib/useAppearance";

interface PaymentWebViewProps {
  bkashURL: string;
  paymentID: string;
  onSuccess: () => void;
  onError: (error: string) => void;
}

export default function PaymentWebView({
  bkashURL,
  paymentID,
  onSuccess,
  onError,
}: PaymentWebViewProps) {
  const [visible, setVisible] = useState(true);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_URL}/api/payment/portpos/status?invoice_id=${encodeURIComponent(paymentID)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.status === "paid") {
          stopPolling();
          setVisible(false);
          onSuccess();
        } else if (data.status === "failed") {
          stopPolling();
          setVisible(false);
          onError("Payment failed");
        }
      }
    } catch {
      // Network error — silently retry
    }
  }, [paymentID, onSuccess, onError]);

  const startPolling = useCallback(() => {
    setPolling(true);
    intervalRef.current = setInterval(checkStatus, 2000);
  }, [checkStatus]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => {
    if (visible && bkashURL) {
      const timer = setTimeout(() => startPolling(), 1000);
      return () => {
        clearTimeout(timer);
        stopPolling();
      };
    }
    return stopPolling;
  }, [visible, bkashURL, startPolling, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleClose = () => {
    stopPolling();
    setVisible(false);
    onError("User cancelled payment");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View className="flex-1" style={{ backgroundColor: bg }}>
        {/* Header bar */}
        <View
          className="flex-row items-center justify-between px-4 py-3 border-b"
          style={{ backgroundColor: surfaceBg, borderBottomColor: borderColor }}
        >
          <Text
            className="text-base font-JakartaBold"
            style={{ color: textPrimary }}
          >
            Payment
          </Text>
          <TouchableOpacity onPress={handleClose} className="px-3 py-1">
            <Text className="text-base font-JakartaSemiBold" style={{ color: colors.danger }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>

        {/* Polling status overlay */}
        {polling && (
          <View className="absolute top-14 left-0 right-0 items-center z-10">
            <View
              className="rounded-full px-4 py-2 flex-row items-center shadow-sm"
              style={{ backgroundColor: isDark ? "rgba(28,30,35,0.95)" : "rgba(255,255,255,0.95)" }}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                className="ml-2 text-sm font-JakartaSemiBold"
                style={{ color: textPrimary }}
              >
                Verifying payment...
              </Text>
            </View>
          </View>
        )}

        {/* WebView */}
        <WebView
          source={{ uri: bkashURL }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View
              className="absolute inset-0 items-center justify-center"
              style={{ backgroundColor: bg }}
            >
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}
