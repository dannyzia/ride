import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';

interface PaymentWebViewProps {
  /** The bKash checkout URL to load in the WebView */
  bkashURL: string;
  /** bKash paymentID returned from createPayment — used for status polling */
  paymentID: string;
  /** Called when polling confirms the payment has been completed */
  onSuccess: () => void;
  /** Called when payment fails or the user cancels */
  onError: (error: string) => void;
}

/**
 * Modal WebView wrapper for bKash mobile payment.
 *
 * 1. Opens the bKash checkout URL inside a full-screen Modal WebView.
 * 2. Polls GET /api/payment/bkash/status?paymentID=... every 2 seconds
 *    to detect when the payment is confirmed.
 * 3. On success (status === 'paid'): calls onSuccess and closes.
 * 4. On failure: calls onError and closes.
 * 5. Shows a loading spinner overlay while polling.
 */
export default function PaymentWebView({ bkashURL, paymentID, onSuccess, onError }: PaymentWebViewProps) {
  const [visible, setVisible] = useState(true);
  const [polling, setPolling] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment/bkash/status?paymentID=${encodeURIComponent(paymentID)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'paid') {
          stopPolling();
          setVisible(false);
          onSuccess();
        } else if (data.status === 'failed') {
          stopPolling();
          setVisible(false);
          onError('Payment failed');
        }
        // 'initiated' / 'callback_pending' → continue polling
      }
    } catch {
      // Network error — silently retry on next interval
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
      // Start polling once the WebView has loaded
      const timer = setTimeout(() => startPolling(), 1000);
      return () => {
        clearTimeout(timer);
        stopPolling();
      };
    }
    return stopPolling;
  }, [visible, bkashURL, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    const url = navState.url;

    // Detect a redirect back to our callback URL (bKash redirects after payment)
    if (url.includes('paymentID=') && url.includes('status=success')) {
      // bKash has redirected with success — polling will pick up the status
      // No action needed here, the polling loop handles it.
    }
  };

  const handleClose = () => {
    stopPolling();
    setVisible(false);
    onError('User cancelled payment');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View className="flex-1 bg-bgColor">
        {/* Header bar */}
        <View className="flex-row items-center justify-between px-4 py-3 bg-cardBgColor border-b border-borderColor">
          <Text className="text-primaryTextColor text-base font-bold">bKash Payment</Text>
          <TouchableOpacity onPress={handleClose} className="px-3 py-1">
            <Text className="text-danger-500 text-base">Close</Text>
          </TouchableOpacity>
        </View>

        {/* Polling status overlay */}
        {polling && (
          <View className="absolute top-14 left-0 right-0 items-center z-10">
            <View className="bg-white/90 rounded-full px-4 py-2 flex-row items-center shadow-sm">
              <ActivityIndicator size="small" color="#0CC25F" />
              <Text className="ml-2 text-sm text-gray-700 font-medium">Verifying payment...</Text>
            </View>
          </View>
        )}

        {/* WebView */}
        <WebView
          source={{ uri: bkashURL }}
          onNavigationStateChange={handleNavigationStateChange}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => (
            <View className="absolute inset-0 items-center justify-center bg-bgColor">
              <ActivityIndicator size="large" color="#0CC25F" />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}
