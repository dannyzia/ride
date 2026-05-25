import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { AntDesign } from '@expo/vector-icons';

export default function AdminLayout() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (!user) {
        router.replace('/(auth)/phone-entry');
        return;
      }
      try {
        const token = await user.getIdToken();
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
    return unsubscribe;
  }, []);

  if (checking) {
    return (
      <View className="flex-1 items-center justify-center bg-bgColor">
        <ActivityIndicator size="large" color="#64B5F6" />
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View className="flex-1 items-center justify-center bg-bgColor px-6">
        <AntDesign name="lock" size={48} color="#E31D1C" />
        <Text className="text-primaryTextColor text-xl font-bold mt-4">Access Denied</Text>
        <Text className="text-secondaryTextColor text-center mt-2">Admin privileges required.</Text>
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Admin' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification' }} />
      <Stack.Screen name="packages" options={{ title: 'Packages' }} />
      <Stack.Screen name="zones" options={{ title: 'Zones' }} />
      <Stack.Screen name="configuration" options={{ title: 'Configuration' }} />
    </Stack>
  );
}
