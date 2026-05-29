import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { logger } from '@/lib/logger';
import Constants from 'expo-constants';

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
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-2xl font-bold text-center mb-2">Create Account</Text>
      <Text className="text-gray-500 text-center mb-8">
        {role === 'driver' ? 'Driver' : 'Rider'} account
      </Text>

      <View className="border border-gray-300 rounded-xl px-4 mb-6">
        <TextInput
          className="py-4 text-base"
          placeholder="Full Name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
        />
      </View>

      {error ? <Text className="text-red-500 text-center mb-4">{error}</Text> : null}

      <TouchableOpacity
        className="bg-goAccent py-4 rounded-xl"
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-center font-semibold text-lg">Create Account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
