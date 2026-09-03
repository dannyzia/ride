import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useDriverStore } from "@/store/useDriverStore";
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useChatStore } from "@/store/useChatStore";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import { VEHICLE_TYPES } from "@/lib/vehicleTypes";
import Avatar from "@/components/Avatar";
import { useTranslation } from "react-i18next";

const vehicleTypeDisplay: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map((v) => [v.key, v.display_en]),
);

interface MenuItem {
  label: string;
  route: string;
  icon: keyof typeof Ionicons.glyphMap;
  section: string;
}

const MENU: MenuItem[] = [
  { label: "Settings", route: "/(main)/(rider)/settings", icon: "settings-outline", section: "Account" },
  { label: "Edit Profile", route: "/(main)/(rider)/edit-profile", icon: "create-outline", section: "Account" },
  { label: "Personal Profile", route: "/(main)/(rider)/personal-profile", icon: "person-outline", section: "Account" },
  { label: "My Vehicles", route: "/(main)/(rider)/vehicle-management", icon: "car-outline", section: "Vehicles" },
  { label: "Documents", route: "/(main)/(rider)/documents", icon: "document-text-outline", section: "Vehicles" },
  { label: "Insurance", route: "/(main)/(rider)/insurance", icon: "shield-checkmark-outline", section: "Vehicles" },
  { label: "Ratings & Reviews", route: "/(main)/(rider)/ratings", icon: "star-outline", section: "Activity" },
  { label: "Referral", route: "/(main)/(rider)/referral", icon: "gift-outline", section: "Activity" },
  { label: "Incentives", route: "/(main)/(rider)/incentives", icon: "trophy-outline", section: "Activity" },
  { label: "Packages", route: "/(main)/(rider)/packages", icon: "cube-outline", section: "Programs" },
  { label: "Emergency Contacts", route: "/(main)/(rider)/emergency-contacts", icon: "people-outline", section: "Safety" },
  { label: "Safety", route: "/(main)/(rider)/safety", icon: "shield-outline", section: "Safety" },
];

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { driver } = useDriverStore();

  const isDark = useIsDark();
  const [profileData, setProfileData] = useState<{
    full_name: string;
    phone: string;
    vehicle_type: string;
    rating: number;
    completed_rides: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError(t('profile.not_authenticated'));
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError(t('profile.failed_to_load'));
        return;
      }
      const data = await res.json();
      setProfileData(data.driver ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.network_error'));
      logger.error("Profile fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleSignOut = useCallback(() => {
    Alert.alert(t('profile.sign_out'), t('driver.sign_out_confirm'), [
      { text: t('common.cancel'), style: "cancel" },
      {
        text: t('profile.sign_out'),
        style: "destructive",
        onPress: async () => {
          try {
            await supabase.auth.signOut();
            // H7: Reset ALL driver-scoped stores to prevent cross-account state leak
            useDriverStore.getState().reset();
            useDriverFlowStore.getState().reset();
            useChatStore.getState().clearChat();
          } catch (e) {
            logger.error("Sign out failed", e);
          }
        },
      },
    ]);
  }, []);

  const displayName =
    profileData?.full_name || driver?.name || t('driver.profile');
  const displayVehicle =
    profileData?.vehicle_type || driver?.vehicle_type || "";
  // Number(): rating is numeric in pg — it can arrive as a string ("4.70"),
  // and "4.70".toFixed crashes the render. Coerce instead of trusting the wire.
  const displayRating = Number(profileData?.rating ?? driver?.rating ?? 0);
  const displayRides =
    profileData?.completed_rides ?? driver?.completed_rides_count ?? 0;

  // Group menu by section
  const SECTION_ORDER = ['Account', 'Vehicles', 'Activity', 'Programs', 'Safety'] as const;
  const grouped = SECTION_ORDER.reduce<Record<string, MenuItem[]>>(
    (acc, section) => {
      acc[section] = MENU.filter((m) => m.section === section);
      return acc;
    },
    {},
  );

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Profile header */}
        <View
          className="items-center px-[24px] py-[32px] border-b"
          style={{ borderColor }}
        >
          <Avatar
            uri={null}
            name={displayName}
            size={80}
            borderWidth={2}
          />
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : error ? (
            <Text
              className="text-[14px] font-Jakarta"
              style={{ color: colors.danger }}
            >
              {error}
            </Text>
          ) : (
            <>
              <Text
                className="text-[20px] font-JakartaBold tracking-tight"
                style={{ color: textPrimary }}
              >
                {displayName}
              </Text>
              <Text
                className="text-[14px] font-Jakarta mt-1 text-center"
                style={{ color: textSecondary }}
              >
                {vehicleTypeDisplay[displayVehicle] ?? displayVehicle?.replace(/_/g, " ")?.replace(/\b\w/g, (c: string) => c.toUpperCase())}
                {" · "}
                <Ionicons name="star" size={12} color={colors.amber} />{" "}
                {displayRating.toFixed(1)} · {displayRides} {t('profile.rides')}
              </Text>
            </>
          )}
        </View>

        {/* Menu grouped by section */}
        <View className="px-[24px] pt-[16px]">
          {SECTION_ORDER.map((section) => {
            const items = grouped[section];
            if (!items?.length) return null;
            return (
              <View key={section} className="mb-4">
                <Text
                  className="text-[11px] font-JakartaSemiBold uppercase mb-2 px-1"
                  style={{ color: textSecondary, letterSpacing: 0.5 }}
                >
                  {section}
                </Text>
                <View
                  className="rounded-[12px] overflow-hidden"
                  style={{ borderWidth: 1, borderColor }}
                >
                  {items.map((item, i) => (
                    <TouchableOpacity
                      key={item.route}
                      className="flex-row items-center gap-3 px-[14px] py-[13px]"
                      style={{
                        backgroundColor: surfaceBg,
                        borderBottomWidth: i < items.length - 1 ? 1 : 0,
                        borderColor,
                      }}
                      onPress={() => router.push(item.route as never)}
                    >
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={colors.primary}
                      />
                      <Text
                        className="text-[15px] font-Jakarta flex-1"
                        style={{ color: textPrimary }}
                      >
                        {item.label}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color={textSecondary}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Sign Out */}
          <TouchableOpacity
            className="rounded-[12px] py-[14px] items-center mt-2"
            style={{
              borderWidth: 1,
              borderColor: colors.danger,
            }}
            onPress={handleSignOut}
          >
            <Text
              className="text-[15px] font-JakartaBold"
              style={{ color: colors.danger }}
            >
              Sign Out
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
