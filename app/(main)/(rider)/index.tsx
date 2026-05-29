import { View, Text, TouchableOpacity, Alert } from 'react-native';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { useDriverStore } from '@/store/useDriverStore';
import { useRideOfferStore, useWSStore } from '@/store';
import CustomButton from '@/components/CustomButton';

const WS_URL = Constants.expoConfig?.extra?.webSocketServerUrl ?? 'ws://localhost:3001';

export default function DriverHome() {
  const {
    driver, activeSubscription, isOnline, activeOffer, wsConnected,
    setDriver, setActiveSubscription, setIsOnline, setActiveOffer, setWsConnected,
  } = useDriverStore();
  const { addRideOffer, removeRideOffer } = useRideOfferStore();

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);

  // ── WebSocket Connection ──────────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket;
    let reconnectAttempts = 0;

    async function connect() {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      ws = new WebSocket(WS_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        useWSStore.getState().setWebSocket(ws);
        ws.send(JSON.stringify({
          type: 'auth:hello',
          access_token: token,
          role: 'driver',
        }));
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          const type = msg.type as string;

          if (type === 'auth:ok') {
            setWsConnected(true);
            // Load driver profile
            await loadDriverProfile();
          } else if (type === 'auth:error') {
            console.warn('[ws] auth error:', msg.message);
          } else if (type === 'ride:offer') {
            addRideOffer({
              id: msg.ride_id,
              pickup: msg.pickup,
              dropoff: msg.dropoff,
              fare_breakdown: msg.fare_breakdown,
              vehicle_type: msg.vehicle_type,
              rider_first_name: msg.rider_first_name,
              distance_km: msg.distance_km,
              expires_at: msg.expires_at,
              status: 'pending',
            } as any);
            setActiveOffer(msg);
          } else if (type === 'offer:lost' || type === 'offer:expired') {
            removeRideOffer(msg.ride_id);
            if (activeOffer?.ride_id === msg.ride_id) {
              setActiveOffer(null);
            }
          } else if (type === 'offer:accepted') {
            router.replace('/(main)/(rider)/find-customer');
          } else if (type === 'subscription:expired') {
            setActiveSubscription(null);
          } else if (type === 'admin:suspended') {
            Alert.alert('Suspended', msg.reason ?? 'Your account has been suspended.');
            setIsOnline(false);
          }
        } catch (_e) {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000) + Math.random() * 1000;
        reconnectAttempts++;
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after this
      };

      wsRef.current = ws;
    }

    connect();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      wsRef.current?.close();
    };
  }, []);

  // ── Heartbeat (every 10s when online) ────────────────────────────
  useEffect(() => {
    if (!isOnline || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      return;
    }

    const sendHeartbeat = async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const lat = loc.coords.latitude;
        const lng = loc.coords.longitude;
        setLocation({ lat, lng });

        wsRef.current?.send(JSON.stringify({
          type: 'heartbeat',
          lat,
          lng,
          ts: new Date().toISOString(),
        }));
      } catch {
        // Location permission may be denied
      }
    };

    sendHeartbeat();
    heartbeatRef.current = setInterval(sendHeartbeat, 10_000);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [isOnline]);

  // ── Load driver profile ──────────────────────────────────────────
  const loadDriverProfile = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(
        `${Constants.expoConfig?.extra?.serverUrl ?? ''}/api/driver/me`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setDriver(data);

        // Load active subscription
        const subRes = await fetch(
          `${Constants.expoConfig?.extra?.serverUrl ?? ''}/api/package/active`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (subRes.ok) {
          const subData = await subRes.json();
          setActiveSubscription(subData.subscription);
        }
      }
    } catch {
      // Network error
    }
  }, []);

  // ── Online/Offline Toggle ────────────────────────────────────────
  const toggleOnline = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const newState = !isOnline;
      const res = await fetch(
        `${Constants.expoConfig?.extra?.serverUrl ?? ''}/api/driver/status`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            is_online: newState,
            lat: location?.lat ?? 0,
            lng: location?.lng ?? 0,
          }),
        },
      );

      if (res.ok) {
        setIsOnline(newState);
      } else {
        const err = await res.json();
        Alert.alert('Cannot go online', err.message ?? 'Check your subscription status.');
      }
    } catch {
      Alert.alert('Error', 'Network error. Please try again.');
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <SafeAreaView className="flex-1 bg-goBgLight">
      {/* Header */}
      <View className="px-4 py-3 flex-row items-center justify-between">
        <View>
          <Text className="text-lg font-urbanist-bold text-goTextPrimaryLight">
            {driver?.name ?? 'Driver'}
          </Text>
          <Text className="text-sm text-gray-500 font-inter">
            {driver?.vehicle_type ?? ''}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className={`w-2 h-2 rounded-full mr-2 ${wsConnected ? 'bg-goAccent' : 'bg-goDanger'}`} />
          <Text className="text-xs text-gray-500">{wsConnected ? 'Connected' : 'Offline'}</Text>
        </View>
      </View>

      {/* Map placeholder */}
      <View className="flex-1 bg-gray-200 mx-4 rounded-2xl items-center justify-center">
        <Text className="text-gray-500 font-inter">Map View</Text>
      </View>

      {/* Wallet Card */}
      {activeSubscription && (
        <View className="mx-4 mt-4 p-4 bg-white rounded-2xl shadow-sm border border-goBorderLight">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-inter text-gray-500">Calls Remaining</Text>
            <Text className="text-lg font-urbanist-bold text-goTextPrimaryLight">
              {activeSubscription.calls_remaining === -1
                ? 'Unlimited'
                : activeSubscription.calls_remaining}
            </Text>
          </View>
          <View className="flex-row justify-between items-center mt-2">
            <Text className="text-sm font-inter text-gray-500">Today</Text>
            <Text className="text-sm font-inter text-goTextPrimaryLight">
              {activeSubscription.daily_calls_used} used
            </Text>
          </View>
          {activeSubscription.expires_at && (
            <Text className="text-xs font-inter text-gray-400 mt-2">
              Expires: {new Date(activeSubscription.expires_at).toLocaleDateString()}
            </Text>
          )}
        </View>
      )}

      {/* Buy Package */}
      {!activeSubscription && (
        <TouchableOpacity
          onPress={() => router.push('/(main)/(rider)/packages')}
          className="mx-4 mt-4 p-4 bg-white rounded-2xl border border-goBorderLight items-center"
        >
          <Text className="text-goAccent font-urbanist-bold">Buy a Package to Start</Text>
        </TouchableOpacity>
      )}

      {/* Online/Offline Button */}
      <View className="px-4 py-4">
        <CustomButton
          title={isOnline ? 'Go Offline' : 'Go Online'}
          onPress={toggleOnline}
          bgVariant={isOnline ? 'danger' : 'primary'}
        />
      </View>
    </SafeAreaView>
  );
}
