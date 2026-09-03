import { useState, useEffect, useCallback } from "react";
import { View, Text, TouchableOpacity, ScrollView, Linking, StatusBar, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark, useAppearance } from "@/lib/useAppearance";
import { useTranslation } from "react-i18next";

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string | null;
}

interface SosAlert {
  id: string;
  status: string;
  latitude: string;
  longitude: string;
  message: string | null;
  created_at: string;
  ride_id: string | null;
}

interface SafetyTip {
  title: string;
  description: string;
}

interface Hotline {
  name: string;
  phone: string;
  icon: string;
}

const HOTLINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  shield: "shield-checkmark",
  call: "call",
  flame: "flame",
  medkit: "medkit",
};

const STATUS_COLORS: Record<string, string> = {
  open: colors.danger,
  acknowledged: colors.amber,
  resolved: colors.success,
};

export default function DriverSafety() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<SosAlert[]>([]);
  const [tips, setTips] = useState<SafetyTip[]>([]);
  const [hotlines, setHotlines] = useState<Hotline[]>([]);
  const [loading, setLoading] = useState(true);

  const isDark = useIsDark();
  const { setTheme } = useAppearance();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const fetchSafetyData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${API_URL}/api/driver/safety`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      setContacts(data.emergency_contacts ?? []);
      setRecentAlerts(data.recent_alerts ?? []);
      setTips(data.safety_tips ?? []);
      setHotlines(data.hotlines ?? []);
    } catch (err) {
      logger.error("[driver/safety] fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSafetyData(); }, [fetchSafetyData]);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View className="flex-row items-center px-[24px] py-[16px] border-b" style={{ borderBottomColor: borderColor }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta" style={{ color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold" style={{ color: textPrimary }}>{t('safety.title')}</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 16 }}>
        {/* BD Emergency Hotlines */}
        <Text className="text-[14px] font-Jakarta mb-3" style={{ color: textSecondary }}>{t('safety.emergency_hotlines')}</Text>
        {hotlines.map((h) => (
          <TouchableOpacity
            key={h.phone}
            className="flex-row items-center p-[14px] border rounded-[12px] mb-2"
            style={{ backgroundColor: `${colors.danger}1A`, borderColor: `${colors.danger}4D` }}
            onPress={() => Linking.openURL(`tel:${h.phone}`)}
          >
            <View className="mr-[12px]">
              <Ionicons name={HOTLINE_ICONS[h.icon] ?? "call"} size={24} color={colors.danger} />
            </View>
            <View className="flex-1">
              <Text className="text-[15px] font-JakartaBold" style={{ color: colors.danger }}>{h.name}</Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: colors.danger }}>{h.phone}</Text>
            </View>
            <Ionicons name="call" size={18} color={colors.danger} />
          </TouchableOpacity>
        ))}

        {/* Emergency Contacts */}
        <TouchableOpacity
          className="p-[14px] border rounded-[12px] mt-2 mb-3"
          style={{ backgroundColor: surfaceBg, borderColor }}
          onPress={() => router.push("/(main)/(rider)/emergency-contacts")}
        >
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-[15px] font-JakartaBold" style={{ color: textPrimary }}>{t('safety.emergency_contacts')}</Text>
              <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
                {contacts.length > 0 ? t('safety.contacts_configured', { count: contacts.length }) : t('safety.no_contacts')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={textSecondary} />
          </View>
        </TouchableOpacity>

        {/* Recent SOS Alerts */}
        {recentAlerts.length > 0 && (
          <>
            <Text className="text-[14px] font-Jakarta mt-4 mb-3" style={{ color: textSecondary }}>{t('safety.recent_sos_alerts')}</Text>
            {recentAlerts.map((alert) => (
              <View
                key={alert.id}
                className="p-[14px] border rounded-[12px] mb-2"
                style={{ backgroundColor: surfaceBg, borderColor }}
              >
                <View className="flex-row justify-between items-center mb-1">
                  <View className="flex-row items-center gap-2">
                    <View
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[alert.status] ?? textSecondary }}
                    />
                    <Text className="text-[13px] font-JakartaBold" style={{ color: textPrimary }}>
                      {alert.status.charAt(0).toUpperCase() + alert.status.slice(1)}
                    </Text>
                  </View>
                  <Text className="text-[12px] font-Jakarta" style={{ color: textSecondary }}>
                    {new Date(alert.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {alert.message && (
                  <Text className="text-[13px] font-Jakarta" style={{ color: textSecondary }} numberOfLines={2}>
                    {alert.message}
                  </Text>
                )}
              </View>
            ))}
          </>
        )}

        {/* Safety Tips (from platform_config) */}
        <Text className="text-[14px] font-Jakarta mt-4 mb-3" style={{ color: textSecondary }}>{t('safety.safety_tips')}</Text>
        {tips.map((tip, i) => (
          <View
            key={i}
            className="p-[14px] border rounded-[12px] mb-2"
            style={{ backgroundColor: surfaceBg, borderColor }}
          >
            <Text className="text-[14px] font-JakartaBold" style={{ color: textPrimary }}>
              {i + 1}. {tip.title}
            </Text>
            <Text className="text-[13px] font-Jakarta mt-1" style={{ color: textSecondary }}>
              {tip.description}
            </Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity
        onPress={() => setTheme(isDark ? "light" : "dark")}
        className="absolute top-16 right-4 z-10 w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={20} color={textPrimary} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}
