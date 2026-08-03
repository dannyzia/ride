import { useState } from 'react';
import { API_URL } from '@/lib/config';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StatusBar } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RegisterScreen() {
  const { phone: phoneParam, role: roleParam } = useLocalSearchParams<{ phone?: string; role?: string }>();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneParam ?? '',
          name,
          role: (roleParam ?? 'rider') as 'rider' | 'driver',
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || data.error || 'Registration failed');
        logger.error('[auth] register failed', data);
        setLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        phone: phoneParam ?? '',
        password,
      });

      if (signInError) {
        setError('Registration successful but login failed. Please login manually.');
        logger.error('[auth] signInWithPassword failed', signInError);
        router.replace(`/(auth)/login?phone=${encodeURIComponent(phoneParam ?? '')}`);
        return;
      }

      // Drivers go directly to driver home (onboarding handled in-driver).
      // Riders navigate through location → notifications permission screens.
      if (roleParam === 'driver') {
        router.replace('/(main)/(rider)');
      } else {
        router.replace('/(auth)/enable-location');
      }
    } catch (e: any) {
      setError('Registration failed. Please try again.');
      logger.error('[auth] register error', e);
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-6 justify-center">

        <Text className="text-[28px] font-JakartaBold font-bold text-goTextPrimaryDark mb-1">
          Complete Registration
        </Text>
        <Text className="text-[14px] font-JakartaBold text-goTextSecondaryDark mb-6">
          Enter your details to create your account
        </Text>

        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="Full Name"
            placeholderTextColor={colors.textDisabledDark}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="Password (min 6 characters)"
            placeholderTextColor={colors.textDisabledDark}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-4 mb-4">
          <TextInput
            className="flex-1 py-4 text-goTextPrimaryDark text-[15px] font-JakartaBold"
            placeholder="Confirm Password"
            placeholderTextColor={colors.textDisabledDark}
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </View>

        {error ? (
          <Text className="text-[14px] font-JakartaBold text-goDanger text-center mb-3">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-4 rounded-lg items-center justify-center 
                       ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-JakartaBold font-bold text-goWhite">
              Register
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
