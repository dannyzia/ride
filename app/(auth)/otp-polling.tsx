import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { signInWithCustomToken } from 'firebase/auth';
import { getDatabase, ref, set } from 'firebase/database';
import { auth } from '@/lib/firebase';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

type PollStatus = 'pending' | 'received' | 'mismatch' | 'expired';

export default function OtpPollingScreen() {
  const router = useRouter();
  const { sessionCode, phone, expiresAt, role } = useLocalSearchParams<{
    sessionCode: string; phone: string; expiresAt: string; role: string;
  }>();

  const [status, setStatus] = useState<PollStatus>('pending');
  const [manualOtp, setManualOtp] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const pollCheckAuth = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionCode }),
      });
      const data = await res.json();
      const s = data.status as PollStatus;
      setStatus(s);

      if (s === 'received') {
        stopPolling();
        await signInWithCustomToken(auth, data.firebase_custom_token);
        const idToken = await auth.currentUser?.getIdToken();
        const verifyRes = await fetch(`${API_URL}/api/auth/verify-token`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          router.replace(verifyData.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)');
        } else {
          router.push({
            pathname: '/(auth)/register',
            params: { challenge_jwt: data.challenge_jwt, role },
          });
        }
      } else if (s === 'mismatch') {
        stopPolling();
        Alert.alert('Error', 'Verification mismatch. Please try again.');
        router.replace('/(auth)/phone-entry');
      } else if (s === 'expired') {
        stopPolling();
      }
    } catch {
      // continue polling
    }
  }, [sessionCode, role, router, stopPolling, API_URL]);

  useEffect(() => {
    intervalRef.current = setInterval(pollCheckAuth, 3000);
    return stopPolling;
  }, [pollCheckAuth, stopPolling]);

  useEffect(() => {
    if (status === 'pending') {
      const timer = setTimeout(() => setShowManualInput(true), 20000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  const handleManualSubmit = useCallback(async () => {
    try {
      const db = getDatabase();
      await set(ref(db, `verification_requests/${sessionCode}/receipt`), {
        sender: phone,
        sender_uid: auth.currentUser?.uid,
      });
      setShowManualInput(false);
    } catch {
      Alert.alert('Error', 'Failed to submit code. Try again.');
    }
  }, [sessionCode, phone]);

  const expiresIn = expiresAt ? Math.max(0, Math.floor((Number(expiresAt) - Date.now()) / 1000)) : 0;

  return (
    <View className="flex-1 bg-white px-6 justify-center">
      {status === 'pending' && (
        <>
          <View className="items-center mb-8">
            <View className="w-20 h-20 rounded-full border-4 border-primary items-center justify-center">
              <ActivityIndicator size="large" color="#0CC25F" />
            </View>
          </View>
          <Text className="text-xl font-heading text-gray-900 text-center mb-2">Verifying Code</Text>
          <Text className="text-sm font-body text-gray-500 text-center mb-6">
            Auto-detecting SMS sent to {phone?.replace(/.(?=.{4})/g, '*')}
          </Text>
          {expiresIn > 0 && (
            <Text className="text-xs font-body text-gray-400 text-center">
              Code expires in {expiresIn}s
            </Text>
          )}
        </>
      )}

      {status === 'expired' && (
        <>
          <Text className="text-xl font-heading text-gray-900 text-center mb-6">Code Expired</Text>
          <TouchableOpacity
            className="bg-primary py-4 rounded-full items-center"
            onPress={() => router.replace('/(auth)/phone-entry')}
          >
            <Text className="text-white font-body text-lg">Try Again</Text>
          </TouchableOpacity>
        </>
      )}

      {showManualInput && status === 'pending' && (
        <View className="mt-6">
          <Text className="text-base font-body text-gray-700 mb-3 text-center">
            Didn't receive the code? Enter it manually.
          </Text>
          <TextInput
            className="border border-gray-300 rounded-2xl px-4 py-3 text-center text-2xl tracking-widest mb-4"
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            value={manualOtp}
            onChangeText={setManualOtp}
          />
          <TouchableOpacity
            className={`py-4 rounded-full items-center ${manualOtp.length >= 4 ? 'bg-primary' : 'bg-gray-300'}`}
            disabled={manualOtp.length < 4}
            onPress={handleManualSubmit}
          >
            <Text className="text-white font-body text-lg font-semibold">Verify</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
