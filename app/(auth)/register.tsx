import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function RegisterScreen() {
  const router = useRouter();
  const { challenge_jwt, role } = useLocalSearchParams<{
    challenge_jwt: string;
    role: string;
  }>();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (name.trim().length < 2) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_jwt,
          name: name.trim(),
          role,
        }),
      });

      if (res.status === 201) {
        const data = await res.json();
        // Navigate to role home
        router.replace(
          data.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)'
        );
      } else if (res.status === 409) {
        setError('This number is already registered. Please log in.');
        setTimeout(() => router.replace('/(auth)/phone-entry'), 2000);
      } else if (res.status === 401) {
        setError('Session expired. Start over.');
        setTimeout(() => router.replace('/(auth)/phone-entry'), 2000);
      } else {
        const data = await res.json();
        setError(data.error || 'Registration failed. Try again.');
      }
    } catch {
      setError('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const roleLabel = role === 'driver' ? 'Driver' : 'Rider';

  return (
    <View className="flex-1 bg-white justify-center px-6">
      <Text className="text-2xl font-JakartaBold text-center mb-2">Create your account</Text>
      <Text className="text-base text-gray-500 text-center mb-8">Enter your name to get started</Text>

      {/* Role pill */}
      <View className="flex-row justify-center mb-6">
        <View className="bg-primary-100 rounded-full px-4 py-2">
          <Text className="text-primary-600 font-JakartaSemiBold">
            Signing up as {roleLabel}
          </Text>
        </View>
      </View>

      {/* Name Input */}
      <View className="bg-gray-50 rounded-xl px-4 mb-6 border border-gray-200">
        <TextInput
          className="py-4 text-lg"
          placeholder="Full Name"
          placeholderTextColor="#9CA3AF"
          autoFocus
          value={name}
          onChangeText={setName}
          editable={!loading}
          autoCapitalize="words"
        />
      </View>

      {/* Error */}
      {error && (
        <Text className="text-red-500 text-sm text-center mb-4">{error}</Text>
      )}

      {/* Create Account Button */}
      <TouchableOpacity
        onPress={handleRegister}
        disabled={name.trim().length < 2 || loading}
        className={`py-4 rounded-xl ${name.trim().length < 2 || loading ? 'bg-gray-300' : 'bg-primary-500'}`}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-JakartaSemiBold text-lg">
            Create Account
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
