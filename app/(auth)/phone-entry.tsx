import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { colors } from '@/theme/goRide';
import { SafeAreaView } from 'react-native-safe-area-context';

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
    <SafeAreaView className="flex-1 bg-goBgDark">
      <StatusBar barStyle="light-content" backgroundColor={colors.bgDark} />
      <View className="flex-1 px-[spacing['2xl']] justify-center">

        {/* Logo */}
        <View className="items-center mb-[spacing['4xl']]">
          <Image
            source={require('@/assets/logo/logo.png')}
            className="w-24 h-24 rounded-xl"
            resizeMode="contain"
          />
          <Text className="text-[28px] font-[Urbanist] font-bold text-goTextPrimaryDark mb-[spacing['md']] leading-[1.2] tracking-[-0.5px]">
            GoRide
          </Text>
          <Text className="text-[15px] font-[Urbanist] text-goTextSecondaryDark mb-[spacing['xs']]">
            Your ride, your way
          </Text>
        </View>

        <Text className="text-[22px] font-[Urbanist] font-bold text-goTextPrimaryDark mb-[spacing['xs']]">
          Get Started
        </Text>
        <Text className="text-[14px] font-[Urbanist] text-goTextSecondaryDark mb-[spacing['2xl']]">
          Enter your phone number to continue
        </Text>

        {/* Phone Input */}
        <View className="flex-row items-center bg-goSurfaceElevatedDark rounded-lg border border-goBorderDark px-[spacing['lg']] mb-[spacing['lg']]">
          <Text className="text-[15px] font-[Urbanist] text-goTextSecondaryDark mr-[spacing['sm']]">
            +880
          </Text>
          <TextInput
            className="flex-1 py-[spacing['lg']] text-goTextPrimaryDark text-[15px] font-[Urbanist]"
            placeholder="1XXXXXXXXX"
            placeholderTextColor={colors.textDisabledDark}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            maxLength={10}
          />
        </View>

        {/* Role Selector */}
        <View className="flex-row mb-[spacing['2xl']]">
          <TouchableOpacity
            className={`flex-1 py-[spacing['md']] rounded-lg m-[spacing['sm']]_[spacing['sm']]_0_[spacing['sm']] border border-goBorderDark 
                       ${role === 'rider' ? 'bg-goPrimary text-goWhite' : 'bg-goSurfaceElevatedDark text-goTextSecondaryDark'}`}
            onPress={() => setRole('rider')}
          >
            <Text className="text-[14px] font-[Urbanist] font-bold">
              Rider
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 py-[spacing['md']] rounded-lg m-[spacing['sm']]_0_[spacing['sm']]_[spacing['sm']] border border-goBorderDark 
                       ${role === 'driver' ? 'bg-goPrimary text-goWhite' : 'bg-goSurfaceElevatedDark text-goTextSecondaryDark'}`}
            onPress={() => setRole('driver')}
          >
            <Text className="text-[14px] font-[Urbanist] font-bold">
              Driver
            </Text>
          </TouchableOpacity>
        </View>

        {error ? (
          <Text className="text-[14px] font-[Urbanist] text-goDanger text-center mb-[spacing['md']]">
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className={`py-[spacing['lg']] rounded-full 
                       ${loading ? 'bg-goBorderDark' : 'bg-goPrimary'}`}
          onPress={handleSendCode}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text className="text-[16px] font-[Urbanist] font-bold text-goWhite">
              Send Code
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
