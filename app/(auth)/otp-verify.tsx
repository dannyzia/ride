import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function OtpVerifyScreen() {
  const router = useRouter();
  const { phone, role } = useLocalSearchParams<{ phone: string; role: string }>();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const otpString = otp.join('');

  const handleVerify = async () => {
    if (otpString.length !== 6) {
      setError('Enter the 6-digit code');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        phone: phone!,
        token: otpString,
        type: 'sms',
      });

      if (verifyError) {
        setError(verifyError.message);
        logger.error('[auth] verifyOtp failed', verifyError);
        return;
      }

      // Store session securely
      if (data.session?.access_token) {
        await SecureStore.setItemAsync('supabase_access_token', data.session.access_token);
      }

      if (!API_URL) {
        setError('Server URL not configured');
        return;
      }

      // Check if user is registered
      const res = await fetch(`${API_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });

      const result = await res.json();

      if (result.exists) {
        // Already registered — navigate to role home
        router.replace(
          result.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)'
        );
      } else {
        // New user — navigate to register
        router.push(`/(auth)/register?role=${role}`);
      }
    } catch (e: any) {
      setError('Verification failed. Please try again.');
      logger.error('[auth] verify error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    const newOtp = [...otp];
    newOtp[index] = text.replace(/[^0-9]/g, '');
    setOtp(newOtp);

    // Auto-advance to next input
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number) => {
    if (index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-2xl font-bold text-center mb-2">Verify Code</Text>
      <Text className="text-gray-500 text-center mb-8">
        Enter the 6-digit code sent to {phone}
      </Text>

      <View className="flex-row justify-center mb-8 space-x-3">
        {otp.map((digit, index) => (
          <TextInput
            key={index}
            ref={(ref) => { inputRefs.current[index] = ref; }}
            className="w-12 h-14 border border-gray-300 rounded-xl text-center text-xl font-bold"
            keyboardType="number-pad"
            maxLength={1}
            value={digit}
            onChangeText={(text) => handleOtpChange(text, index)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace') handleKeyDown(index);
            }}
          />
        ))}
      </View>

      {error ? <Text className="text-red-500 text-center mb-4">{error}</Text> : null}

      <TouchableOpacity
        className="bg-goAccent py-4 rounded-xl"
        onPress={handleVerify}
        disabled={loading || otpString.length !== 6}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-center font-semibold text-lg">Verify</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
