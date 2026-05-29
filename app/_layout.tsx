import { colors } from '@/theme/goRide';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { supabase } from '@/lib/supabase';
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        try {
          const token = session.access_token;
          const res = await fetch(`${API_URL}/api/auth/verify-token`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });

          if (res.ok) {
            const data = await res.json();
            const inAuthGroup = segments[0] === '(auth)';
            if (data.exists && inAuthGroup) {
              router.replace(
                data.role === 'driver' ? '/(main)/(rider)' : '/(main)/(customer)'
              );
            } else if (!data.exists) {
              router.replace('/(auth)/phone-entry');
            }
          } else {
            router.replace('/(auth)/phone-entry');
          }
        } catch {
          router.replace('/(auth)/phone-entry');
        }
      } else {
        const inAuthGroup = segments[0] === '(auth)';
        if (!inAuthGroup) {
          router.replace('/(auth)/phone-entry');
        }
      }
      setInitializing(false);
    });

    return () => subscription.unsubscribe();
  }, [router, segments, API_URL]);

  if (initializing) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return <Slot />;
}
