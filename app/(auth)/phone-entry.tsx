import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { signVerificationRequest } from '@/lib/hmac';

export default function PhoneEntryScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
      setInitializing(false);
    })();
  }, []);

  const handleSendCode = useCallback(async () => {
    const fullPhone = `+880${phone}`;
    setLoading(true);
    try {
      const data = await signVerificationRequest(fullPhone, Date.now());
      router.push({
        pathname: '/(auth)/otp-polling',
        params: { sessionCode: data.sessionCode, phone: fullPhone, expiresAt: String(data.expiresAt), role },
      });
    } catch (e: any) {
      const status = e?.status ?? 0;
      if (status === 401) Alert.alert('Error', 'Verification failed. Update the app.');
      else if (status === 400) Alert.alert('Error', 'Request timed out. Try again.');
      else if (status === 429) Alert.alert('Error', 'Too many attempts. Wait 5 minutes.');
      else Alert.alert('Error', 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [phone, role, router]);

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#0CC25F" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-3xl font-heading text-gray-900 mb-2">Get Started</Text>
      <Text className="text-base font-body text-gray-500 mb-8">Enter your phone number to continue</Text>

      <View className="flex-row items-center border border-gray-300 rounded-2xl px-4 py-3 mb-6">
        <Text className="text-lg font-body text-gray-700 mr-2">+880</Text>
        <TextInput
          className="flex-1 text-lg font-body text-gray-900"
          placeholder="1XXXXXXXXX"
          keyboardType="phone-pad"
          maxLength={10}
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <View className="flex-row mb-8 bg-gray-100 rounded-full p-1">
        <TouchableOpacity
          className={`flex-1 py-3 rounded-full ${role === 'rider' ? 'bg-white shadow' : ''}`}
          onPress={() => setRole('rider')}
        >
          <Text className={`text-center font-body ${role === 'rider' ? 'text-primary' : 'text-gray-500'}`}>
            I am a Rider
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 rounded-full ${role === 'driver' ? 'bg-white shadow' : ''}`}
          onPress={() => setRole('driver')}
        >
          <Text className={`text-center font-body ${role === 'driver' ? 'text-primary' : 'text-gray-500'}`}>
            I am a Driver
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        className={`py-4 rounded-full items-center ${phone.length === 10 && !loading ? 'bg-primary' : 'bg-gray-300'}`}
        disabled={phone.length !== 10 || loading}
        onPress={handleSendCode}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white font-body text-lg font-semibold">Send Code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
