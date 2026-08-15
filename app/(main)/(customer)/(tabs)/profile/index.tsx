import { useState, useEffect, useCallback, type ReactNode } from "react";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";
import SettingsRow from "@/components/plan03/SettingsRow";
import EmptyState from "@/components/plan03/EmptyState";
import { useDriverStore } from "@/store/useDriverStore";
import { useRiderStore } from "@/store/useRiderStore";
import { useChatStore } from "@/store/useChatStore";

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  profile_image_url: string | null;
  rating: number | null;
  rating_count: number;
  created_at: string;
}

interface MeResponse {
  user?: UserProfile;
  error?: string;
}

const EDIT_ROUTE = "/(main)/(customer)/profile/edit";
const CHANGE_PASSWORD_ROUTE = "/(main)/(customer)/change-password";
const APPEARANCE_ROUTE = "/(main)/(customer)/(tabs)/settings/app-appearance";
const NOTIFICATIONS_ROUTE = "/(main)/(customer)/(tabs)/settings/notifications";
const SAVED_ADDRESSES_ROUTE = "/(main)/(customer)/(tabs)/settings/saved-addresses";
const EMERGENCY_CONTACTS_ROUTE = "/(main)/(customer)/(tabs)/settings/emergency-contacts";
const FAQ_ROUTE = "/(main)/(customer)/(tabs)/settings/faq";
const CONTACT_SUPPORT_ROUTE = "/(main)/(customer)/(tabs)/settings/contact-support";
const REPORT_ISSUE_ROUTE = "/(main)/(customer)/report-issue";
const DELETE_ACCOUNT_ROUTE = "/(main)/(customer)/(tabs)/settings/delete-account";

const Profile = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDark = useIsDark();
  const setTheme = useAppearance((s) => s.setTheme);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;
  const skeletonBg = isDark ? colors.darkSecondary : colors.gray100;

  const fetchProfile = useCallback(async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not signed in");
        return;
      }
      const res = await fetch(`${API_URL}/api/user/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as MeResponse;
      if (!res.ok || !data.user) {
        throw new Error(data.error ?? "Failed to load profile");
      }
      setProfile(data.user);
      setError(null);
    } catch (err) {
      setError("Couldn't load your profile. Check your connection and try again.");
      logger.error("[profile] fetch failed", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
  }, [fetchProfile]);

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      const driverReset = useDriverStore.getState().reset;
      if (driverReset) driverReset();
      const riderReset = useRiderStore.getState().reset;
      if (riderReset) riderReset();
      const chatClear = useChatStore.getState().clearChat;
      if (chatClear) chatClear();
    } catch (err) {
      logger.error("[profile] sign out failed", err);
      Alert.alert("Sign Out Failed", "Please try again.");
    }
  }, []);

  const confirmSignOut = useCallback(() => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => { void handleSignOut(); } },
    ]);
  }, [handleSignOut]);

  const renderSection = (title: string, children: ReactNode) => (
    <View key={title}>
      <Text style={[styles.sectionTitle, { color: textSecondary }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: surfaceBg, borderColor }]}>{children}</View>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View style={styles.skeletonContent}>
          <View style={[styles.skeletonAvatar, { backgroundColor: skeletonBg }]} />
          <View style={[styles.skeletonName, { backgroundColor: skeletonBg }]} />
          <View style={[styles.skeletonMeta, { backgroundColor: skeletonBg }]} />
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: skeletonBg }]} />
          ))}
        </View>
      </SafeAreaView>
    );
  }

  if (error || !profile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View style={styles.centerContent}>
          <EmptyState
            icon="warning-outline"
            title="Couldn't load profile"
            subtitle={error ?? "Something went wrong"}
            actionLabel="Try Again"
            onAction={fetchProfile}
          />
        </View>
      </SafeAreaView>
    );
  }

  const nameParts = profile.name.split(" ").filter(Boolean);
  const initials = nameParts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  const memberSinceYear = profile.created_at
    ? new Date(profile.created_at).getFullYear()
    : null;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.screenHeader}>
          <Text style={[styles.screenTitle, { color: textPrimary }]}>Profile</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Toggle theme"
            onPress={() => setTheme(isDark ? "light" : "dark")}
            style={styles.themeToggle}
          >
            <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.avatarBlock}>
          <View style={styles.avatarWrap}>
            <View
              style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}
            >
              {profile.profile_image_url ? (
                <Image source={{ uri: profile.profile_image_url }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitials}>{initials || "?"}</Text>
              )}
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Edit profile"
              onPress={() => router.push(EDIT_ROUTE)}
              style={[styles.editBadge, { backgroundColor: surfaceBg, borderColor }]}
            >
              <Ionicons name="pencil" size={16} color={textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={[styles.name, { color: textPrimary }]}>{profile.name}</Text>
          <View style={styles.metaRow}>
            {profile.rating !== null ? (
              <>
                <Ionicons name="star" size={14} color={colors.amber} />
                <Text style={[styles.metaText, { color: textSecondary }]}>
                  {profile.rating.toFixed(1)}
                </Text>
                <Text style={[styles.metaText, { color: textDisabled }]}>•</Text>
              </>
            ) : null}
            {memberSinceYear ? (
              <Text style={[styles.metaText, { color: textSecondary }]}>
                Rider since {memberSinceYear}
              </Text>
            ) : null}
          </View>
        </View>

        {renderSection(
          "ACCOUNT",
          <>
            <SettingsRow
              icon="person-outline"
              label="Edit Profile"
              onPress={() => router.push(EDIT_ROUTE)}
            />
            <SettingsRow
              icon="call-outline"
              label="Phone Number"
              showChevron={false}
              onPress={() => {}}
              rightElement={
                <Text style={[styles.phoneValue, { color: textSecondary }]} numberOfLines={1}>
                  {profile.phone}
                </Text>
              }
            />
            <SettingsRow
              icon="key-outline"
              label="Change Password"
              onPress={() => router.push(CHANGE_PASSWORD_ROUTE)}
              isLast
            />
          </>,
        )}

        {renderSection(
          "PREFERENCES",
          <>
            <SettingsRow
              icon="sunny-outline"
              label="Appearance"
              onPress={() => router.push(APPEARANCE_ROUTE)}
            />
            <SettingsRow
              icon="notifications-outline"
              label="Notifications"
              onPress={() => router.push(NOTIFICATIONS_ROUTE)}
            />
            <SettingsRow
              icon="home-outline"
              label="Saved Addresses"
              onPress={() => router.push(SAVED_ADDRESSES_ROUTE)}
            />
            <SettingsRow
              icon="warning-outline"
              label="Emergency Contacts"
              onPress={() => router.push(EMERGENCY_CONTACTS_ROUTE)}
              isLast
            />
          </>,
        )}

        {renderSection(
          "SUPPORT",
          <>
            <SettingsRow icon="help-circle-outline" label="FAQ" onPress={() => router.push(FAQ_ROUTE)} />
            <SettingsRow
              icon="headset-outline"
              label="Contact Support"
              onPress={() => router.push(CONTACT_SUPPORT_ROUTE)}
            />
            <SettingsRow
              icon="flag-outline"
              iconColor={colors.amber}
              label="Report Issue"
              onPress={() => router.push(REPORT_ISSUE_ROUTE)}
              isLast
            />
          </>,
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={confirmSignOut}
          style={styles.signOutButton}
        >
          <Text style={[styles.signOutText, { color: colors.danger }]}>Sign Out</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Delete account"
          onPress={() => router.push(DELETE_ACCOUNT_ROUTE)}
          style={styles.deleteAccountButton}
        >
          <Text style={[styles.deleteAccountText, { color: textDisabled }]}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 100 },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 16,
    marginBottom: 8,
    minHeight: 56,
  },
  screenTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
  },
  themeToggle: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBlock: {
    alignItems: "center",
    marginTop: 16,
    marginBottom: 24,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 3,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitials: {
    fontFamily: "Jakarta-Bold",
    fontSize: 36,
    color: colors.primary,
  },
  editBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    fontFamily: "Jakarta-Bold",
    fontSize: 20,
    textAlign: "center",
    marginTop: 16,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
  },
  metaText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  sectionTitle: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  phoneValue: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
    maxWidth: 140,
  },
  signOutButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  signOutText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
  },
  deleteAccountButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteAccountText: {
    fontFamily: "Jakarta-Regular",
    fontSize: 13,
  },
  skeletonContent: {
    flex: 1,
    alignItems: "center",
    padding: 24,
    paddingTop: 32,
    gap: 16,
  },
  skeletonAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  skeletonName: {
    width: 160,
    height: 20,
    borderRadius: 10,
  },
  skeletonMeta: {
    width: 220,
    height: 13,
    borderRadius: 6,
  },
  skeletonCard: {
    width: "100%",
    height: 180,
    borderRadius: 16,
  },
  centerContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});

export default Profile;
