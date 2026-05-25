import * as Crypto from 'expo-crypto';
import { auth } from './firebase';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export async function sha256(data: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, data);
}

export async function signVerificationRequest(phone: string, timestamp: number) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Not authenticated');

  const signature = await sha256(`${phone}:${timestamp}`);
  const res = await fetch(`${API_URL}/api/auth/challenge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ phone, timestamp, signature }),
  });

  const data = await res.json();
  if (!res.ok) throw { status: res.status, ...data };
  return data;
}
