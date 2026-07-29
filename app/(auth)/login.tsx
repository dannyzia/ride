import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Strip +880 prefix from an E.164 param so the input field only shows
 * the local 10-digit portion (the "+880" is displayed as a label).
 */
function stripCountryCode(phone: string): string {
  if (phone.startsWith('+880')) return phone.slice(4);
  if (phone.startsWith('880')) return phone.slice(3);
  return phone.replace(/^0+/, '');
}

export default function LoginScreen() {
  const { phone: phoneParam } = useLocalSearchParams<{ phone?: string }>();
  const [phone, setPhone] = useState(stripCountryCode(phoneParam ?? ''));
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const fullPhone = `+880${phone.replace(/^0+/, '')}`;
    if (fullPhone.length < 13) {
      setError('Enter a valid phone number');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    setError('');

    logger.info('[auth-debug] signIn attempt', { phoneLen: fullPhone.length, passLen: password.length });

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: fullPhone,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        logger.error('[auth] signInWithPassword failed', signInError);
        return;
      }

      // Auth gate (onAuthStateChange in _layout.tsx) handles role-based
      // redirect — do NOT navigate manually here.
    } catch (e: any) {
      setError('Login failed. Please try again.');
      logger.error('[auth] login error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-6 justify-center">

        <Text className="text-[28px] font-JakartaBold font-bold text-goTextPrimaryDark mb-1">
          Welcome Back
        </Text>
        <Text className="text-[14px] font-JakartaBold text-goTextSecondaryDark mb-6">
          Enter your phone number and password to login
        </Text>

        {/* Phone Input */}
        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <Text className="text-[15px] font-JakartaBold text-goTextSecondaryDark mr-2">
            +880
          </Text>
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="1XXXXXXXXX"
            placeholderTextColor={colors.textDisabledDark}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={10}
          />
        </View>

        {/* Password Input */}
        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="Password"
            placeholderTextColor={colors.textDisabledDark}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
          />
        </View>

        {error ? (
          <Text className="text-[14px] font-JakartaBold text-goDanger text-center mb-3">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-4 rounded-lg items-center justify-center mb-4
                       ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">
              Login
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} className="items-center">
          <Text className="text-[14px] font-JakartaBold text-goPrimary">
            Forgot Password?
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
