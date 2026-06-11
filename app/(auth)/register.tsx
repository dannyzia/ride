import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StatusBar } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function RegisterScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role: string }>();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async () => {
    if (!name || name.length < 2) {
      setError('Name must be at least 2 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = await SecureStore.getItemAsync('supabase_access_token');
      if (!token) {
        setError('Session expired. Please go back and verify again.');
        return;
      }

      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error === 'phone_exists' ? 'Account already exists' : 'Registration failed');
        return;
      }

      const data = await res.json();
      router.replace(data.next);
    } catch (e: any) {
      setError('Registration failed. Please try again.');
      logger.error('[auth] register error', e);
    } finally {
      setLoading(false);
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
          Create Account
        </Text>
        <Text className="text-[14px] font-[Urbanist] text-goTextSecondaryDark mb-[spacing['2xl']]">
          {role === 'driver' ? 'Driver' : 'Rider'} account
        </Text>

        {/* Name Input */}
        <View className="bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-[spacing['lg']] mb-[spacing['2xl']]">
          <TextInput
            className="py-[spacing['lg']] text-goTextPrimaryDark text-[15px] font-[Urbanist]"
            placeholder="Full Name"
            placeholderTextColor={colors.textDisabledDark}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        {error ? (
          <Text className="text-[14px] font-[Urbanist] text-goDanger text-center mb-[spacing['md']]">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-[spacing['lg']] rounded-full 
                       ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-[Urbanist] font-bold text-goWhite">
              Create Account
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
