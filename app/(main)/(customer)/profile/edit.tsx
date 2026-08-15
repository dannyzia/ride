import { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance, useIsDark } from "@/lib/useAppearance";

interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  profile_image_url: string | null;
}

interface MeResponse {
  user?: UserProfile;
  error?: string;
  message?: string;
}

export default function EditProfile() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const setTheme = useAppearance((s) => s.setTheme);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const textDisabled = isDark ? colors.textDisabledDark : colors.textDisabledLight;

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch(`${API_URL}/api/user/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as MeResponse;
        if (!mounted) return;
        if (res.ok && data.user) {
          setName(data.user.name ?? "");
          setEmail(data.user.email ?? "");
          setPhoto(data.user.profile_image_url ?? null);
        }
      } catch (err) {
        logger.error("[edit-profile] load failed", err);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };
    void loadProfile();
    return () => {
      mounted = false;
    };
  }, []);

  const pickImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0].uri);
      }
    } catch (err) {
      logger.error("[edit-profile] image pick failed", err);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Name must be at least 2 characters");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not signed in");
        return;
      }
      const body: { name: string; profile_image_url?: string } = { name: trimmed };
      if (photo) body.profile_image_url = photo;
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as MeResponse;
      if (!res.ok) {
        setError(data.message ?? data.error ?? "Failed to save");
        return;
      }
      Alert.alert("Profile Updated", "Your changes have been saved.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setError("Network error. Please try again.");
      logger.error("[edit-profile] save failed", err);
    } finally {
      setSaving(false);
    }
  }, [name, photo]);

  const saveDisabled = saving || name.trim().length < 2;
  const saveButtonBg = saveDisabled
    ? isDark
      ? colors.darkSecondary
      : colors.gray200
    : colors.primary;

  if (loadingProfile) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={bg} />
      <View style={styles.screenHeader}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.screenTitle, { color: textPrimary }]} numberOfLines={1}>
          Edit Profile
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Toggle theme"
          onPress={() => setTheme(isDark ? "light" : "dark")}
          style={styles.themeToggle}
        >
          <Ionicons name={isDark ? "sunny-outline" : "moon-outline"} size={24} color={textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.avatarBlock}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Change profile photo"
            onPress={() => void pickImage()}
            activeOpacity={0.8}
          >
            <View
              style={[styles.avatarCircle, { backgroundColor: colors.primaryLight }]}
            >
              {photo ? (
                <Image source={{ uri: photo }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="camera-outline" size={28} color={colors.primary} />
              )}
            </View>
            <View style={[styles.photoBadge, { backgroundColor: surfaceBg, borderColor }]}>
              <Ionicons name="pencil" size={14} color={textSecondary} />
            </View>
          </TouchableOpacity>
          <Text style={[styles.photoHint, { color: textSecondary }]}>Change photo</Text>
        </View>

        <Text style={[styles.fieldLabel, { color: textSecondary }]}>Name</Text>
        <TextInput
          accessibilityLabel="Name"
          style={[
            styles.input,
            { backgroundColor: surfaceBg, borderColor, color: textPrimary },
          ]}
          placeholder="Enter your name"
          placeholderTextColor={textDisabled}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={[styles.fieldLabel, { color: textSecondary }]}>Email</Text>
        <View
          style={[
            styles.disabledInputWrap,
            { backgroundColor: isDark ? colors.darkSecondary : colors.gray100 },
          ]}
        >
          <TextInput
            accessibilityLabel="Email (read only)"
            style={[styles.inputBase, styles.disabledInput, { color: textSecondary }]}
            placeholder="No email added"
            placeholderTextColor={textDisabled}
            value={email}
            onChangeText={setEmail}
            editable={false}
          />
          <Ionicons name="lock-closed-outline" size={16} color={textDisabled} />
        </View>
        <Text style={[styles.fieldHint, { color: textDisabled }]}>
          Email can&apos;t be changed in the app yet
        </Text>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.dangerLight }]}>
            <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Save profile"
          onPress={() => void handleSave()}
          disabled={saveDisabled}
          activeOpacity={0.8}
          style={[styles.saveButton, { backgroundColor: saveButtonBg }]}
        >
          {saving ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text style={styles.saveText}>Save</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  centerContent: { flex: 1, alignItems: "center", justifyContent: "center" },
  screenHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    minHeight: 56,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  screenTitle: {
    flex: 1,
    fontFamily: "Jakarta-Bold",
    fontSize: 28,
    marginLeft: 4,
  },
  themeToggle: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  avatarBlock: {
    alignItems: "center",
    marginBottom: 24,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
  photoBadge: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  photoHint: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    marginTop: 10,
  },
  fieldLabel: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    marginBottom: 20,
  },
  inputBase: {
    flex: 1,
    fontFamily: "Jakarta-Medium",
    fontSize: 15,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  disabledInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingRight: 16,
  },
  disabledInput: {
    paddingVertical: 14,
  },
  fieldHint: {
    fontFamily: "Jakarta-Regular",
    fontSize: 11,
    marginTop: 6,
  },
  errorBanner: {
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  errorText: {
    fontFamily: "Jakarta-Medium",
    fontSize: 13,
  },
  saveButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveText: {
    fontFamily: "Jakarta-SemiBold",
    fontSize: 15,
    color: colors.white,
  },
});
