import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { auth } from '@/lib/firebase';
import { signInAnonymously } from 'firebase/auth';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

type Role = 'rider' | 'driver';

export default function PhoneEntryScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendCode = async () => {
    if (phone.length < 10) return;
    setLoading(true);
    setError(null);
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }

      const fullPhone = `+880${phone}`;
      const timestamp = Date.now();

      // In dev: call local challenge endpoint
      // In production: call startVerification Cloud Function via Firebase
      const res = await fetch(`${API_URL}/api/auth/challenge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await auth.currentUser!.getIdToken()}`,
        },
        body: JSON.stringify({ phone: fullPhone, timestamp, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        switch (res.status) {
          case 401: setError('Verification failed. Update the app.'); break;
          case 400: setError('Request timed out. Try again.'); break;
          case 429: setError('Too many attempts. Wait 5 minutes.'); break;
          default:  setError(data.error || 'Something went wrong.');
        }
        return;
      }

      const data = await res.json();
      router.push({
        pathname: '/(auth)/otp-polling',
        params: {
          sessionCode: data.sessionCode || '',
          phone: fullPhone,
          expiresAt: String(Date.now() + 60000),
          role,
          challengeJwt: data.challenge_jwt || '',
        },
      });
    } catch (e: any) {
      setError(e.message || 'Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white justify-center px-6">
      <Text className="text-2xl font-JakartaBold text-center mb-2">Welcome to Ride</Text>
      <Text className="text-base text-gray-500 text-center mb-8">Enter your phone number to get started</Text>

      <View className="flex-row items-center bg-gray-50 rounded-xl px-4 mb-4 border border-gray-200">
        <Text className="text-lg font-JakartaSemiBold text-gray-700 mr-2">+880</Text>
        <TextInput
          className="flex-1 py-4 text-lg"
          keyboardType="number-pad"
          placeholder="1XXXXXXXXX"
          placeholderTextColor="#9CA3AF"
          maxLength={10}
          value={phone}
          onChangeText={setPhone}
          editable={!loading}
        />
      </View>

      <View className="flex-row bg-gray-100 rounded-xl p-1 mb-6">
        <TouchableOpacity
          onPress={() => setRole('rider')}
          className={`flex-1 py-3 rounded-lg ${role === 'rider' ? 'bg-white shadow' : ''}`}
        >
          <Text className={`text-center font-JakartaSemiBold ${role === 'rider' ? 'text-primary-500' : 'text-gray-500'}`}>
            I am a Rider
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setRole('driver')}
          className={`flex-1 py-3 rounded-lg ${role === 'driver' ? 'bg-white shadow' : ''}`}
        >
          <Text className={`text-center font-JakartaSemiBold ${role === 'driver' ? 'text-primary-500' : 'text-gray-500'}`}>
            I am a Driver
          </Text>
        </TouchableOpacity>
      </View>

      {error && <Text className="text-red-500 text-sm text-center mb-4">{error}</Text>}

      <TouchableOpacity
        onPress={handleSendCode}
        disabled={phone.length < 10 || loading}
        className={`py-4 rounded-xl ${phone.length < 10 || loading ? 'bg-gray-300' : 'bg-primary-500'}`}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-white text-center font-JakartaSemiBold text-lg">Send Code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
