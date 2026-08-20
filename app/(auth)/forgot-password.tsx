import { useState, useCallback } from 'react';
import { API_URL } from '@/lib/config';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsDark } from '@/lib/useAppearance';

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

  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const placeholderColor = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const disabledBg = isDark ? colors.darkSecondary : colors.gray100;

  const sendOtp = useCallback(async (phone: string) => {
    setLoading(true);
    setError('');

    try {
      const checkResponse = await fetch(`${API_URL}/api/auth/check-user`, {
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

      const otpResponse = await fetch(`${API_URL}/api/auth/send-otp`, {
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
    } catch (e) {
      setError('Failed to send OTP. Please try again.');
      logger.error('[auth] forgot-password send-otp error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSendOtp = async () => {
    const fPhone = `+880${phoneInput}`;
    if (fPhone.length !== 14) {
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
      const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
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
    } catch (e) {
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
      const response = await fetch(`${API_URL}/api/auth/reset-password`, {
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
    } catch (e) {
      setError('Failed to reset password. Please try again.');
      logger.error('[auth] reset password error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-1 px-6 justify-center">

        <Text className="text-[28px] font-JakartaBold font-bold mb-1" style={{ color: textPrimary }}>
          {step === 'phone' ? 'Forgot Password' : step === 'otp' ? 'Verify OTP' : 'Reset Password'}
        </Text>
        <Text className="text-[14px] font-JakartaBold mb-6" style={{ color: textSecondary }}>
          {step === 'phone'
            ? 'Enter your phone number to receive OTP'
            : step === 'otp'
              ? 'Enter the OTP sent to your phone'
              : 'Enter your new password'}
        </Text>

        {step === 'phone' && (
          <>
            <View
              className="flex-row items-center rounded-lg border px-4 mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <Text className="text-[15px] font-JakartaBold mr-2" style={{ color: textSecondary }}>
                +880
              </Text>
              <TextInput
                className="flex-1 py-4 text-[15px] font-JakartaBold"
                style={{ color: textPrimary }}
                placeholder="1XXXXXXXXX"
                placeholderTextColor={placeholderColor}
                keyboardType="phone-pad"
                value={phoneInput}
                onChangeText={(text) => setPhoneInput(text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10))}
                maxLength={10}
              />
            </View>

            <TouchableOpacity
              className="py-4 rounded-lg items-center justify-center"
              style={{ backgroundColor: loading ? disabledBg : colors.primary }}
              onPress={handleSendOtp}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Send OTP"
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
            <View
              className="flex-row items-center rounded-lg border px-4 mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <TextInput
                className="flex-1 py-4 text-[15px] font-JakartaBold"
                style={{ color: textPrimary }}
                placeholder="Enter 6-digit OTP"
                placeholderTextColor={placeholderColor}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={6}
              />
            </View>

            <TouchableOpacity
              className="py-4 rounded-lg items-center justify-center mb-2"
              style={{ backgroundColor: loading ? disabledBg : colors.primary }}
              onPress={handleVerifyOtp}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Verify OTP"
            >
              {loading ? (
                <ActivityIndicator size={20} color={colors.white} />
              ) : (
                <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">Verify OTP</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setStep('phone')} className="items-center" accessibilityRole="button">
              <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>
                Change Phone Number
              </Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'password' && (
          <>
            <View
              className="flex-row items-center rounded-lg border px-4 mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <TextInput
                className="flex-1 py-4 text-[15px] font-JakartaBold"
                style={{ color: textPrimary }}
                placeholder="New Password"
                placeholderTextColor={placeholderColor}
                secureTextEntry
                value={newPassword}
                onChangeText={setNewPassword}
              />
            </View>

            <View
              className="flex-row items-center rounded-lg border px-4 mb-4"
              style={{ backgroundColor: surfaceBg, borderColor }}
            >
              <TextInput
                className="flex-1 py-4 text-[15px] font-JakartaBold"
                style={{ color: textPrimary }}
                placeholder="Confirm New Password"
                placeholderTextColor={placeholderColor}
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <TouchableOpacity
              className="py-4 rounded-lg items-center justify-center"
              style={{ backgroundColor: loading ? disabledBg : colors.primary }}
              onPress={handleResetPassword}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Reset password"
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
          <Text className="text-[14px] font-JakartaBold text-center mt-3" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
