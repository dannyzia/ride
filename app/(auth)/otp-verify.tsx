import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

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

      if (data.session?.access_token) {
        await SecureStore.setItemAsync('supabase_access_token', data.session.access_token);
      }

      if (!API_URL) {
        setError('Server URL not configured');
        return;
      }

      const res = await fetch(`${API_URL}/api/auth/verify-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}` },
      });

      const result = await res.json();

      if (result.exists) {
        router.replace(
          result.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)'
        );
      } else {
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
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-[spacing['2xl']] justify-center">

        {/* Logo */}
        <View className="items-center mb-[spacing['4xl']]">
          <Image
            source={require('@/assets/logo/logo.png')}
            className="w-18 h-18 rounded-lg"
            resizeMode="contain"
          />
        </View>

        <Text className="text-[24px] font-[Urbanist] font-bold text-goTextPrimaryDark mb-[spacing['xs']]">
          Verify Code
        </Text>
        <Text className="text-[14px] font-[Urbanist] text-goTextSecondaryDark mb-[spacing['3xl']]">
          Enter the 6-digit code sent to {phone}
        </Text>

        {/* OTP Boxes */}
        <View className="flex-row justify-between mb-[spacing['3xl']]">
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(ref) => { inputRefs.current[index] = ref; }}
              className={`w-[48px] h-[56px] rounded-md border-[1.5] 
                         ${digit ? 'border-goPrimary' : 'border-goBorderDark'}
                         bg-goSurfaceElevatedDark text-center text-[20px] font-[Urbanist] font-bold text-goTextPrimaryDark`}
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

        {error ? (
          <Text className="text-[14px] font-[Urbanist] text-goDanger text-center mb-[spacing['md']]">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-[spacing['lg']] rounded-full 
                       ${loading || otpString.length !== 6 ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleVerify}
          disabled={loading || otpString.length !== 6}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-[Urbanist] font-bold text-goWhite">
              Verify
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
