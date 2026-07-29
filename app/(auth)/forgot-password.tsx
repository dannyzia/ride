import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ForgotPasswordScreen() {
  const [phoneInput, setPhoneInput] = useState('');
  const [fullPhone, setFullPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'phone' | 'otp' | 'password'>('phone');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sendOtp = useCallback(async (phone: string) => {
    setLoading(true);
    setError('');

    try {
      const checkResponse = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/check-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        setError(checkData.message || 'Failed to verify phone number');
        return;
      }

      if (!checkData.exists) {
        setError('No account found with this phone number');
        return;
      }

      const otpResponse = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const otpData = await otpResponse.json();

      if (!otpResponse.ok) {
        setError(otpData.message || 'Failed to send OTP');
        return;
      }

      setSessionId(otpData.sessionId);
      setStep('otp');
    } catch (e: any) {
      setError('Failed to send OTP. Please try again.');
      logger.error('[auth] forgot-password send-otp error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSendOtp = async () => {
    const fPhone = `+880${phoneInput.replace(/^0+/, '')}`;
    if (fPhone.length < 13) {
      setError('Enter a valid phone number');
      return;
    }
    setFullPhone(fPhone);
    await sendOtp(fPhone);
  };

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
        return;
      }

      setStep('password');
    } catch (e: any) {
      setError('Failed to verify OTP. Please try again.');
      logger.error('[auth] forgot-password verify-otp error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: fullPhone, newPassword }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Failed to reset password');
        return;
      }

      router.replace(`/(auth)/login?phone=${encodeURIComponent(fullPhone)}`);
    } catch (e: any) {
      setError('Failed to reset password. Please try again.');
      logger.error('[auth] reset password error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-6 justify-center">

        <Text className="text-[28px] font-JakartaBold font-bold text-goTextPrimaryDark mb-1">
          {step === 'phone' ? 'Forgot Password' : step === 'otp' ? 'Verify OTP' : 'Reset Password'}
        </Text>
        <Text className="text-[14px] font-JakartaBold text-goTextSecondaryDark mb-6">
          {step === 'phone'
            ? 'Enter your phone number to receive OTP'
            : step === 'otp'
              ? 'Enter the OTP sent to your phone'
              : 'Enter your new password'}
        </Text>

        {step === 'phone' && (
          <>
            <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
              <Text className="text-[15px] font-JakartaBold text-goTextSecondaryDark mr-2">
                +880
              </Text>
              <TextInput
                className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
                placeholder="1XXXXXXXXX"
                placeholderTextColor={colors.textDisabledDark}
                keyboardType="phone-pad"
                value={phoneInput}
                onChangeText={setPhoneInput}
                maxLength={10}
              />
            </View>

            <TouchableOpacity
              className={`py-4 rounded-lg items-center justify-center ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
              onPress={handleSendOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color={colors.white} />
              ) : (
                <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">Send OTP</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {step === 'otp' && (
          <>
            <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
              <TextInput
                className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
                placeholder="Enter 6-digit OTP"
                placeholderTextColor={colors.textDisabledDark}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              className={`py-4 rounded-lg items-center justify-center mb-2 ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
              onPress={handleVerifyOtp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color={colors.white} />
              ) : (
                <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">Verify OTP</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('phone')} className="items-center">
              <Text className="text-[14px] font-JakartaBold text-goPrimary">Change Phone Number</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
              <TextInput
                className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
                placeholder="New Password"
                placeholderTextColor={colors.textDisabledDark}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
              <TextInput
                className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
                placeholder="Confirm New Password"
                placeholderTextColor={colors.textDisabledDark}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <TouchableOpacity
              className={`py-4 rounded-lg items-center justify-center ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
              onPress={handleResetPassword}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size={20} color={colors.white} />
              ) : (
                <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">Reset Password</Text>
              )}
            </TouchableOpacity>
          </>
        )}

        {error ? (
          <Text className="text-[14px] font-JakartaBold text-goDanger text-center mt-3">
            {error}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
