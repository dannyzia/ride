import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, Linking } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import ChatScreen from "@/components/ChatScreen";

interface RideContext {
  current_user_id: string;
  other_user_name: string;
  other_user_phone: string;
  ride_active: boolean;
}

export default function DriverChatRoute() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ctx, setCtx] = useState<RideContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!rideId) return;
    fetch(`${API_URL}/api/ride/${rideId}/details`)
      .then(async (res) => {
        if (!res.ok) {
          setError("Failed to load chat");
          return;
        }
        setCtx(await res.json());
      })
      .catch(() => setError("Network error"));
  }, [rideId]);

  if (error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgLight,
        }}
      >
        <Text style={{ color: colors.danger, fontSize: 15 }}>{error}</Text>
      </View>
    );
  }

  if (!ctx) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bgLight,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          title: `Chat with ${ctx.other_user_name}`,
        }}
      />
      <ChatScreen
        rideId={rideId!}
        currentUserId={ctx.current_user_id}
        otherUserName={ctx.other_user_name}
        rideActive={ctx.ride_active}
        onCallPress={() => {
          if (ctx.other_user_phone)
            Linking.openURL(`tel:${ctx.other_user_phone}`);
        }}
      />
    </>
  );
}
