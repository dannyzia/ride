import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { useDriverFlowStore } from '@/store/useDriverFlowStore';
import { useWSStore } from '@/store';
import { logger } from '@/lib/logger';

export default function RideOfferSheet() {
  const { activeOffer, setActiveOffer } = useDriverFlowStore();
  const ws = useWSStore((s) => s.ws);
  const [remainingMs, setRemainingMs] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activeOffer) return;
    const expiresAt = new Date(activeOffer.expires_at).getTime();
    setRemainingMs(Math.max(0, expiresAt - Date.now()));

    const timer = setInterval(() => {
      const left = Math.max(0, expiresAt - Date.now());
      setRemainingMs(left);
      if (left <= 0) setActiveOffer(null);
    }, 100);

    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();

    return () => clearInterval(timer);
  }, [activeOffer]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gs) => {
        slideAnim.setValue(Math.max(0, gs.dx));
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > 200) {
          handleAccept();
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!activeOffer) return null;

  const sendWS = (type: string, payload: Record<string, unknown>) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ride_id: activeOffer.ride_id, ...payload }));
    } else {
      logger.warn('[RideOfferSheet] WS not open, cannot send', { type });
    }
  };

  const handleAccept = () => {
    sendWS('fetch:confirm', {});
    sendWS('offer:accept', {});
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setActiveOffer(null);
    });
  };

  const handleReject = () => {
    sendWS('offer:reject', { reason: 'driver_declined' });
    setActiveOffer(null);
  };

  const fareTk = (activeOffer.fare_breakdown.total_bdt / 100).toFixed(0);

  return (
    <Animated.View
      className="absolute bottom-0 left-0 right-0 bg-cardBgColor rounded-t-3xl p-6 shadow-lg z-50"
      style={{ opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [300, 0] }) }] }}
    >
      {/* Countdown */}
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-primaryTextColor text-lg font-bold">New Ride Offer</Text>
        <View className="bg-hoverBgColor rounded-full px-3 py-1">
          <Text className="text-primaryTextColor text-sm">{(remainingMs / 1000).toFixed(0)}s</Text>
        </View>
      </View>

      {/* Fare */}
      <View className="mb-4">
        <Text className="text-primaryTextColor text-3xl font-bold">৳{fareTk}</Text>
        <Text className="text-secondaryTextColor text-sm">{activeOffer.distance_km} km</Text>
      </View>

      {/* Locations */}
      <View className="mb-6">
        <View className="flex-row items-center mb-2">
          <View className="w-2 h-2 rounded-full bg-accentColor mr-3" />
          <Text className="text-primaryTextColor flex-1" numberOfLines={1}>
            {activeOffer.pickup.address}
          </Text>
        </View>
        <View className="flex-row items-center">
          <View className="w-2 h-2 rounded-full bg-danger-500 mr-3" />
          <Text className="text-primaryTextColor flex-1" numberOfLines={1}>
            {activeOffer.dropoff.address}
          </Text>
        </View>
      </View>

      {/* Swipe to Accept */}
      <View className="bg-hoverBgColor rounded-full h-14 justify-center mb-3 overflow-hidden">
        <Animated.View
          className="absolute left-0 top-0 bottom-0 w-14 bg-general-400 rounded-full items-center justify-center"
          style={{ transform: [{ translateX: slideAnim }] }}
        >
          <Text className="text-white text-xl">{'→'}</Text>
        </Animated.View>
        <View {...panResponder.panHandlers} className="flex-1 items-center justify-center">
          <Text className="text-primaryTextColor font-semibold">Swipe to Accept</Text>
        </View>
      </View>

      {/* Decline */}
      <TouchableOpacity onPress={handleReject} className="items-center py-2">
        <Text className="text-secondaryTextColor">Decline</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
