import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';
import Constants from 'expo-constants';
// import RNOtpVerify from 'react-native-otp-verify'; // Android SMS_RETRIEVER_API

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function OtpPollingScreen() {
  const router = useRouter();
  const { sessionCode, phone, expiresAt, role } = useLocalSearchParams<{
    sessionCode: string;
    phone: string;
    expiresAt: string;
    role: string;
  }>();

  const [status, setStatus] = useState<'pending' | 'received' | 'mismatch' | 'expired'>('pending');
  const [manualCode, setManualCode] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Start polling checkAuth every 3s
  useEffect(() => {
    if (!sessionCode) return;

    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionCode }),
        });

        if (!res.ok) throw new Error('check_failed');

        const data = await res.json();
        setStatus(data.status);

        if (data.status === 'received') {
          // Stop polling
          if (pollingRef.current) clearInterval(pollingRef.current);

          // Step 1: Sign in with Firebase custom token
          await signInWithCustomToken(auth, data.firebase_custom_token);

          // Step 2: Check if user exists
          const idToken = await auth.currentUser!.getIdToken();
          const verifyRes = await fetch(`${API_URL}/api/auth/verify-token`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${idToken}` },
          });

          if (verifyRes.ok) {
            const userData = await verifyRes.json();
            if (userData.exists) {
              // Existing user — navigate to role home
              router.replace(userData.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)');
            } else {
              // New user — navigate to register
              router.replace({
                pathname: '/(auth)/register',
                params: { challenge_jwt: data.challenge_jwt, role },
              });
            }
          } else {
            // User not found — navigate to register
            router.replace({
              pathname: '/(auth)/register',
              params: { challenge_jwt: data.challenge_jwt, role },
            });
          }
        } else if (data.status === 'mismatch') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          setError('Phone number mismatch. Please try again.');
          setTimeout(() => router.back(), 2000);
        } else if (data.status === 'expired') {
          if (pollingRef.current) clearInterval(pollingRef.current);
        }
      } catch (e) {
        // Silently retry on next interval
      }
    };

    // Start polling
    pollingRef.current = setInterval(poll, 3000);
    poll(); // immediate first poll

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [sessionCode]);

  // Show manual code entry after 20s of no auto-detection
  useEffect(() => {
    const timer = setTimeout(() => setShowManual(true), 20000);
    return () => clearTimeout(timer);
  }, []);

  // Android SMS auto-receive via SMS_RETRIEVER_API
  useEffect(() => {
    // TODO: Implement SMS_RETRIEVER_API when react-native-otp-verify is available
    // import RNOtpVerify from 'react-native-otp-verify';
    // RNOtpVerify.getHash().then(hash => { ... });
    // RNOtpVerify.addListener(message => {
    //   const code = message.match(/AUTH:(\d{6})/)?.[1];
    //   if (code) handleManualSubmit(code);
    // });
    // return () => RNOtpVerify.removeListener();
  }, []);

  const handleManualSubmit = async (code?: string) => {
    const otp = code || manualCode;
    if (otp.length !== 6) return;

    try {
      // Write receipt to RTDB via Cloud Function or direct API
      const res = await fetch(`${API_URL}/api/auth/submit-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode, otp }),
      });

      if (res.ok) {
        // Next poll will detect 'received'
        setShowManual(false);
      } else {
        setError('Invalid code. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    }
  };

  const handleResend = () => {
    router.replace('/(auth)/phone-entry');
  };

  // Countdown
  const expiresIn = Math.max(0, Math.floor((parseInt(expiresAt || '0') - Date.now()) / 1000));

  return (
    <View className="flex-1 bg-white justify-center px-6">
      {/* Animated pulsing ring placeholder */}
      <View className="items-center mb-8">
        <View className="w-24 h-24 rounded-full bg-primary-100 items-center justify-center">
          <Text className="text-3xl text-primary-500">✓</Text>
        </View>
      </View>

      <Text className="text-xl font-JakartaBold text-center mb-2">Verifying your number</Text>
      <Text className="text-base text-gray-500 text-center mb-1">We sent a code to {phone}</Text>
      <Text className="text-sm text-gray-400 text-center mb-8">
        {status === 'pending' ? 'Auto-detecting...' : status === 'received' ? 'Verified!' : status}
      </Text>

      {/* Countdown */}
      {expiresIn > 0 && (
        <Text className="text-center text-gray-400 mb-4">
          Code expires in {expiresIn}s
        </Text>
      )}

      {/* Manual code entry (shown after 20s) */}
      {showManual && status === 'pending' && (
        <View className="mb-6">
          <Text className="text-sm text-gray-500 text-center mb-3">
            Enter the 6-digit code from SMS
          </Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-center text-2xl tracking-widest"
            keyboardType="number-pad"
            maxLength={6}
            placeholder="000000"
            placeholderTextColor="#9CA3AF"
            value={manualCode}
            onChangeText={setManualCode}
          />
          <TouchableOpacity
            onPress={() => handleManualSubmit()}
            disabled={manualCode.length !== 6}
            className={`mt-3 py-3 rounded-xl ${manualCode.length === 6 ? 'bg-primary-500' : 'bg-gray-300'}`}
          >
            <Text className="text-white text-center font-JakartaSemiBold">Submit Code</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error */}
      {error && (
        <Text className="text-red-500 text-sm text-center mb-4">{error}</Text>
      )}

      {/* Expired state */}
      {status === 'expired' && (
        <TouchableOpacity onPress={handleResend} className="py-3 rounded-xl bg-primary-500">
          <Text className="text-white text-center font-JakartaSemiBold">Resend Code</Text>
        </TouchableOpacity>
      )}

      {/* Loading indicator while polling */}
      {status === 'pending' && !showManual && (
        <ActivityIndicator size="small" color="#6366f1" />
      )}

      {/* Resend link */}
      {status === 'pending' && (
        <TouchableOpacity onPress={handleResend} className="mt-6">
          <Text className="text-primary-500 text-center">Use a different number</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
