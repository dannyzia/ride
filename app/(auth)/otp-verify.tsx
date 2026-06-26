import { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function OtpVerifyScreen() {
  const { phone: phoneParam, role: roleParam } = useLocalSearchParams<{ phone?: string; role?: string }>();
  const phone = phoneParam ?? '';

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const otpSentRef = useRef(false);

  const sendOtp = useCallback(async () => {
    if (!phone) return;
    setSending(true);
    setError('');

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to send OTP');
        logger.error('[auth] send-otp failed', data);
        return;
      }

      setSessionId(data.sessionId);
    } catch (e: any) {
      setError('Failed to send OTP. Please try again.');
      logger.error('[auth] send otp error', e);
    } finally {
      setSending(false);
    }
  }, [phone]);

  // Send OTP exactly once on mount — ref guard prevents React StrictMode
  // double-fire in development.
  useEffect(() => {
    if (otpSentRef.current) return;
    otpSentRef.current = true;
    sendOtp();
  }, [sendOtp]);

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      setError('Enter a valid 6-digit OTP');
      return;
    }

    if (!sessionId) {
      setError('Please wait for the OTP to be sent');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, otp }),
      });

      const data = await response.json();

      if (!response.ok || !data.verified) {
        setError(data.message || 'Invalid OTP');
        logger.error('[auth] verify-otp failed', data);
        return;
      }

      router.push(`/(auth)/register?phone=${encodeURIComponent(phone)}&role=${roleParam}`);
    } catch (e: any) {
      setError('Failed to verify OTP. Please try again.');
      logger.error('[auth] verify otp error', e);
    } finally {
      setLoading(false);
    }
  };

  const isLoading = loading || sending;

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-6 justify-center">

        <Text className="text-[28px] font-[Urbanist] font-bold text-goTextPrimaryDark mb-1">
          Verify OTP
        </Text>
        <Text className="text-[14px] font-[Urbanist] text-goTextSecondaryDark mb-6">
          Enter the 6-digit code sent to {phone}
        </Text>

        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-[Urbanist]"
            placeholder="Enter 6-digit OTP"
            placeholderTextColor={colors.textDisabledDark}
            keyboardType="number-pad"
            value={otp}
            onChangeText={setOtp}
            maxLength={6}
          />
        </View>

        {error ? (
          <Text className="text-[14px] font-[Urbanist] text-goDanger text-center mb-3">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-4 rounded-lg items-center justify-center mb-4
                       ${isLoading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleVerifyOtp}
          disabled={isLoading || !sessionId}
        >
          {isLoading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-[Urbanist] font-bold text-goWhite">
              Verify OTP
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={sendOtp} disabled={isLoading} className="items-center">
          <Text className="text-[14px] font-[Urbanist] text-goPrimary">
            Resend OTP
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
