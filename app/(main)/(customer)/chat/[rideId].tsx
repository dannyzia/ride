import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/theme/goRide";
import { API_URL } from "@/lib/config";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, Text, Linking, StatusBar, TouchableOpacity } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import ChatScreen from "@/components/ChatScreen";
import { useIsDark, useAppearance } from "@/lib/useAppearance";

interface RideContext {
  current_user_id: string;
  other_user_name: string;
  other_user_phone: string;
  ride_active: boolean;
}

export default function CustomerChatRoute() {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const [ctx, setCtx] = useState<RideContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

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
          backgroundColor: bg,
        }}
      >
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
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
          backgroundColor: bg,
        }}
      >
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
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
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </View>
  );
}
