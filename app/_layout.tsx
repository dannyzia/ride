import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import Constants from 'expo-constants';
import { logger } from '@/lib/logger';

// Conditional Sentry init — @sentry/react-native may not be installed in dev
try {
  const Sentry = require('@sentry/react-native');
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.2,
    // Do not log PII
    beforeSend: (event: any) => {
      if (event.request?.url) event.request.url = event.request.url.replace(/\/api\/(?:ride|driver|auth)\/\S+/, '/api/[redacted]');
      return event;
    },
  });
} catch {
  logger.info('[sentry] @sentry/react-native not available');
}

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      if (user) {
        // User has Firebase session — check if registered
        try {
          const token = await user.getIdToken();
          const res = await fetch(`${API_URL}/api/auth/verify-token`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            const inAuthGroup = segments[0] === '(auth)';
            if (inAuthGroup) {
              router.replace(
                data.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)'
              );
            }
          } else {
            // User has Firebase token but no DB record — must register
            router.replace('/(auth)/phone-entry');
          }
        } catch {
          router.replace('/(auth)/phone-entry');
        }
      } else {
        // No user — go to auth
        const inAuthGroup = segments[0] === '(auth)';
        if (!inAuthGroup) {
          router.replace('/(auth)/phone-entry');
        }
      }
      setInitializing(false);
    });

    return unsubscribe;
  }, [router, segments, API_URL]);

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return <Slot />;
}
