import { colors } from '@/theme/goRide';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AntDesign } from '@expo/vector-icons';
import { logger } from '@/lib/logger';

export default function AdminLayout() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Guard: if Supabase client is not configured, show access denied
    // instead of crashing on supabase.auth.onAuthStateChange.
    if (!supabase?.auth?.onAuthStateChange) {
      logger.warn('[admin] Supabase client not configured');
      setChecking(false);
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user ?? null;
      if (!user) {
        router.replace('/(auth)/phone-entry');
        return;
      }
      try {
        const token = session?.access_token;
        if (!token) throw new Error('No token');
        const res = await fetch('/api/auth/verify-token', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setIsAdmin(data.role === 'admin');
        }
      } catch {
        setIsAdmin(false);
      } finally {
        setChecking(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-bgColor">
        <ActivityIndicator size="large" color={colors.adminAccent} />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-bgColor px-6">
        <AntDesign name="lock" size={48} color={colors.danger} />
        <Text className="text-primaryTextColor text-xl font-bold mt-4">Access Denied</Text>
        <Text className="text-secondaryTextColor text-center mt-2">Admin privileges required.</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.darkSurface },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification' }} />
      <Stack.Screen name="packages" options={{ title: 'Packages' }} />
      <Stack.Screen name="zones" options={{ title: 'Zones' }} />
      <Stack.Screen name="city-boundaries" options={{ title: 'City Boundaries' }} />
      <Stack.Screen name="configuration" options={{ title: 'Configuration' }} />
    </Stack>
  );
}
