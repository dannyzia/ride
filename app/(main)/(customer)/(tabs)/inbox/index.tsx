import { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

interface Notification {
  id: string;
  title: string;
  body: string;
  time_ago: string;
  read: boolean;
  type: "promo" | "trip" | "payment" | "system";
}

const FALLBACK_NOTIFICATIONS: Notification[] = [
  { id: "n1", title: "Promo unlocked!", body: "Use WELCOME10 for 10% off your next ride.", time_ago: "2h", read: false, type: "promo" },
  { id: "n2", title: "Trip completed", body: "Thanks for riding with Ride. Rate your driver.", time_ago: "1d", read: true, type: "trip" },
  { id: "n3", title: "Top-up successful", body: "৳500 has been added to your wallet.", time_ago: "2d", read: true, type: "payment" },
  { id: "n4", title: "New feature", body: "You can now share your trip with trusted contacts.", time_ago: "3d", read: false, type: "system" },
];

export default function Inbox() {
  const [notifications, setNotifications] = useState<Notification[]>(FALLBACK_NOTIFICATIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true); setError("");
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          setLoading(false);
          return;
        }
        const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/rider/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) {
          logger.warn("Notifications API failed, using fallback", data);
          return;
        }
        if (!cancelled && data.notifications) {
          setNotifications(data.notifications);
        }
      } catch (err: any) {
        logger.warn("Notifications fetch failed, using fallback", err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case "promo": return "🎁";
      case "trip": return "🚗";
      case "payment": return "💳";
      case "system": return "📢";
      default: return "🔔";
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Notifications</Text>
        <View className="w-[50px]" />
      </View>
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0CC25F" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goDanger text-center">{error}</Text>
        </View>
      ) : notifications.length === 0 ? (
        <View className="flex-1 items-center justify-center px-[24px]">
          <Text className="text-[16px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">No notifications yet</Text>
        </View>
      ) : (
        <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
          {notifications.map((n) => (
            <View
              key={n.id}
              className={`p-[14px] rounded-[12px] border mb-3 ${
                n.read
                  ? "bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border-goBorderLight dark:border-goBorderDark"
                  : "bg-goAccentLight border-goPrimary"
              }`}
            >
              <View className="flex-row items-start">
                <View className="w-8 h-8 rounded-full bg-goBgLight dark:bg-goBgDark items-center justify-center mr-3">
                  <Text className="text-[16px]">{getIcon(n.type)}</Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row justify-between">
                    <Text className="text-[15px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">{n.title}</Text>
                    <Text className="text-[12px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark">{n.time_ago}</Text>
                  </View>
                  <Text className="text-[13px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mt-1">{n.body}</Text>
                </View>
                {!n.read && (
                  <View className="w-2 h-2 rounded-full bg-goPrimary ml-2 mt-2" />
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}