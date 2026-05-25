import { useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function RegisterScreen() {
  const router = useRouter();
  const { challenge_jwt, role } = useLocalSearchParams<{
    challenge_jwt: string; role: string;
  }>();

  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = useCallback(async () => {
    if (name.trim().length < 2) { Alert.alert('Error', 'Name must be at least 2 characters.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_jwt, name: name.trim(), role }),
      });

      if (res.status === 201) {
        router.replace(role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)');
      } else if (res.status === 409) {
        Alert.alert('Error', 'This number is already registered. Please log in.');
        router.replace('/(auth)/phone-entry');
      } else if (res.status === 401) {
        Alert.alert('Error', 'Session expired. Start over.');
        router.replace('/(auth)/phone-entry');
      } else {
        const data = await res.json();
        Alert.alert('Error', data?.message ?? 'Registration failed.');
      }
    } catch {
      Alert.alert('Error', 'Connection failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [name, challenge_jwt, role, router]);

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-3xl font-heading text-gray-900 mb-2">Create Account</Text>
      <Text className="text-base font-body text-gray-500 mb-8">Enter your name to get started</Text>

      <View className="flex-row items-center mb-6">
        <View className="bg-primary/10 px-4 py-2 rounded-full">
          <Text className="text-primary font-body text-sm capitalize">{role}</Text>
        </View>
      </View>

      <TextInput
        className="border border-gray-300 rounded-2xl px-4 py-3 text-lg font-body text-gray-900 mb-8"
        placeholder="Full Name"
        autoFocus
        value={name}
        onChangeText={setName}
        maxLength={100}
      />

      <TouchableOpacity
        className={`py-4 rounded-full items-center ${name.trim().length >= 2 && !loading ? 'bg-primary' : 'bg-gray-300'}`}
        disabled={name.trim().length < 2 || loading}
        onPress={handleRegister}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-body text-lg font-semibold">Create Account</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
