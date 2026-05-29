import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export default function PhoneEntryScreen() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'rider' | 'driver'>('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendCode = async () => {
    const fullPhone = `+880${phone.replace(/^0+/, '')}`;
    if (fullPhone.length < 10) {
      setError('Enter a valid phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: fullPhone,
        options: { channel: 'sms' },
      });

      if (otpError) {
        setError(otpError.message);
        logger.error('[auth] signInWithOtp failed', otpError);
        return;
      }

      router.push(`/(auth)/otp-verify?phone=${encodeURIComponent(fullPhone)}&role=${role}`);
    } catch (e: any) {
      setError('Failed to send code. Please try again.');
      logger.error('[auth] send code error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      <Text className="text-2xl font-bold text-center mb-2">Get Started</Text>
      <Text className="text-gray-500 text-center mb-8">Enter your phone number to continue</Text>

      <View className="flex-row items-center border border-gray-300 rounded-xl px-4 mb-4">
        <Text className="text-gray-500 mr-2">+880</Text>
        <TextInput
          className="flex-1 py-4 text-base"
          placeholder="1XXXXXXXXX"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
          maxLength={10}
        />
      </View>

      {/* Role Selector */}
      <View className="flex-row mb-6">
        <TouchableOpacity
          className={`flex-1 py-3 rounded-xl mr-2 ${role === 'rider' ? 'bg-goAccent' : 'bg-gray-100'}`}
          onPress={() => setRole('rider')}
        >
          <Text className={`text-center font-semibold ${role === 'rider' ? 'text-white' : 'text-gray-600'}`}>
            Rider
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          className={`flex-1 py-3 rounded-xl ml-2 ${role === 'driver' ? 'bg-goAccent' : 'bg-gray-100'}`}
          onPress={() => setRole('driver')}
        >
          <Text className={`text-center font-semibold ${role === 'driver' ? 'text-white' : 'text-gray-600'}`}>
            Driver
          </Text>
        </TouchableOpacity>
      </View>

      {error ? <Text className="text-red-500 text-center mb-4">{error}</Text> : null}

      <TouchableOpacity
        className="bg-goAccent py-4 rounded-xl"
        onPress={handleSendCode}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-white text-center font-semibold text-lg">Send Code</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
