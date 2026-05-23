import { View, Text, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { WebView } from 'react-native-webview';
import CustomButton from './CustomButton';
import { PaymentProps } from '@/types/type';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

type PaymentMethod = 'bkash' | 'nagad' | 'cash';

export default function Payment({ fullName, amount, handlePaymentDone }: PaymentProps) {
  const [loading, setLoading] = useState(false);
  const [bkashUrl, setBkashUrl] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);

  const handleBkashPayment = async () => {
    setSelectedMethod('bkash');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/payment/bkash/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ride_id: '00000000-0000-0000-0000-000000000000', // Will be set by caller
          amount_bdt: Math.round(parseFloat(amount || '0') * 100),
        }),
      });

      const data = await res.json();
      if (data.bkashURL) {
        setBkashUrl(data.bkashURL);
      } else {
        // Dev fallback — no real bKash credentials
        handlePaymentDone();
      }
    } catch {
      // Dev fallback — backend not running
      handlePaymentDone();
    } finally {
      setLoading(false);
    }
  };

  const handleNagadPayment = () => {
    setSelectedMethod('nagad');
    // Nagad integration placeholder
    handlePaymentDone();
  };

  const handleCashPayment = () => {
    setSelectedMethod('cash');
    handlePaymentDone();
  };

  const handleBkashCallback = (event: any) => {
    const url = event.url;
    if (url.includes('paymentID=') && (url.includes('status=success') || url.includes('status=completed'))) {
      setBkashUrl(null);
      handlePaymentDone();
    }
  };

  return (
    <View style={{ justifyContent: 'center', padding: 5 }}>
      <Text className="text-center text-base font-JakartaSemiBold text-neutral-800 mb-4">
        Select Payment Method
      </Text>

      {/* bKash */}
      <TouchableOpacity
        onPress={handleBkashPayment}
        disabled={loading}
        className="flex-row items-center bg-pink-50 border border-pink-200 rounded-xl px-4 py-3 mb-3"
      >
        <View className="w-10 h-10 bg-pink-500 rounded-lg items-center justify-center mr-3">
          <Text className="text-white font-bold text-lg">bK</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-neutral-800">bKash</Text>
          <Text className="text-sm text-neutral-500">Pay with bKash</Text>
        </View>
        {loading && selectedMethod === 'bkash' && <ActivityIndicator size="small" />}
      </TouchableOpacity>

      {/* Nagad */}
      <TouchableOpacity
        onPress={handleNagadPayment}
        disabled={loading}
        className="flex-row items-center bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 mb-3"
      >
        <View className="w-10 h-10 bg-orange-500 rounded-lg items-center justify-center mr-3">
          <Text className="text-white font-bold text-lg">NG</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-neutral-800">Nagad</Text>
          <Text className="text-sm text-neutral-500">Pay with Nagad</Text>
        </View>
        {loading && selectedMethod === 'nagad' && <ActivityIndicator size="small" />}
      </TouchableOpacity>

      {/* Cash */}
      <TouchableOpacity
        onPress={handleCashPayment}
        className="flex-row items-center bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4"
      >
        <View className="w-10 h-10 bg-green-500 rounded-lg items-center justify-center mr-3">
          <Text className="text-white font-bold text-lg">$</Text>
        </View>
        <View className="flex-1">
          <Text className="text-base font-JakartaSemiBold text-neutral-800">Cash</Text>
          <Text className="text-sm text-neutral-500">Pay with cash to driver</Text>
        </View>
      </TouchableOpacity>

      {/* bKash WebView Modal */}
      <Modal visible={!!bkashUrl} transparent animationType="slide">
        <View className="flex-1 pt-12 bg-black">
          <View className="flex-row justify-end px-4 py-2 bg-gray-900">
            <TouchableOpacity onPress={() => setBkashUrl(null)}>
              <Text className="text-white text-base font-JakartaSemiBold">Cancel</Text>
            </TouchableOpacity>
          </View>
          {bkashUrl && (
            <WebView
              source={{ uri: bkashUrl }}
              onNavigationStateChange={handleBkashCallback}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              renderLoading={() => (
                <View className="absolute inset-0 items-center justify-center bg-white">
                  <ActivityIndicator size="large" />
                </View>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}
