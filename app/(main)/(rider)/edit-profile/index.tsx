import { useState, useEffect, useCallback } from "react";
import { API_URL } from "@/lib/config";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/imageToURL";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DriverProfile {
  full_name: string;
  phone: string;
  email: string | null;
  city: string | null;
  profile_image_url: string | null;
  vehicle_type: string;
  rating: number;
  completed_rides: number;
}

export default function EditProfile() {
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${API_URL}/api/driver/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const p = data.driver ?? data;
        setProfile(p);
        setFullName(p.full_name ?? p.name ?? "");
        setEmail(p.email ?? "");
        setCity(p.city ?? "");
        setPhoto(p.profile_image_url ?? null);
      }
    } catch (err) {
      logger.error("Profile fetch failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const pickImage = async () => {
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
    } catch {
      logger.error("Image pick failed");
    }
  };

  const handleSave = async () => {
    if (!fullName.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    let profileImageUrl: string | null = null;

    // Upload photo if changed
    if (photo && !photo.startsWith("http")) {
      setUploading(true);
      try {
        profileImageUrl = await uploadImage(
          photo,
          `profiles/${Date.now()}_${fullName.trim().replace(/\s+/g, "_")}.jpg`,
        );
      } catch {
        setError("Failed to upload photo. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Not authenticated");
        return;
      }
      const body: Record<string, unknown> = {
        name: fullName.trim(),
      };
      if (profileImageUrl) body.profile_image_url = profileImageUrl;
      else if (photo === null) body.profile_image_url = null;
      if (email.trim()) body.email = email.trim();
      if (city.trim()) body.city = city.trim();

      const res = await fetch(`${API_URL}/api/driver/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Failed to update");
        return;
      }
      Alert.alert("Saved", "Profile updated successfully.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      logger.error("Profile update failed", err);
    } finally {
      setSaving(false);
    }
  };

  const isBusy = uploading || saving;

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: bg }}
      >
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={bg}
        />
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
      />
      {/* Header */}
      <View
        className="flex-row items-center px-[24px] py-[16px] border-b"
        style={{ borderBottomColor: borderColor }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          className="mr-[12px] p-[4px]"
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          className="flex-1 text-center text-[18px] font-JakartaBold"
          style={{ color: textPrimary }}
        >
          Edit Profile
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        className="flex-1 px-[24px]"
        contentContainerStyle={{ paddingVertical: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Photo */}
        <TouchableOpacity
          className="items-center mb-2"
          onPress={pickImage}
          disabled={isBusy}
        >
          {photo ? (
            <Image
              source={{ uri: photo }}
              className="w-24 h-24 rounded-full"
            />
          ) : (
            <View
              className="w-24 h-24 rounded-full items-center justify-center"
              style={{
                backgroundColor: isDark
                  ? colors.primaryLightDark
                  : colors.primaryLight,
              }}
            >
              <Ionicons name="camera-outline" size={28} color={colors.primary} />
              <Text
                className="text-[11px] font-Jakarta mt-1"
                style={{ color: colors.primary }}
              >
                Add Photo
              </Text>
            </View>
          )}
          {uploading && (
            <Text
              className="text-[12px] font-Jakarta mt-2"
              style={{ color: textSecondary }}
            >
              Uploading photo...
            </Text>
          )}
        </TouchableOpacity>

        {/* Name */}
        <View>
          <Text
            className="text-[14px] font-JakartaSemiBold mb-2"
            style={{ color: textPrimary }}
          >
            Full Name
          </Text>
          <TextInput
            className="rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              color: textPrimary,
            }}
            placeholder="Enter your name"
            placeholderTextColor={textSecondary}
            value={fullName}
            onChangeText={setFullName}
          />
        </View>

        {/* Phone (read-only) */}
        {profile?.phone && (
          <View>
            <Text
              className="text-[14px] font-JakartaSemiBold mb-2"
              style={{ color: textPrimary }}
            >
              Phone
            </Text>
            <View
              className="rounded-[10px] px-[16px] py-[14px]"
              style={{ backgroundColor: surfaceBg, borderWidth: 1, borderColor }}
            >
              <Text
                className="text-[15px] font-Jakarta"
                style={{ color: textSecondary }}
              >
                {profile.phone}
              </Text>
            </View>
          </View>
        )}

        {/* Email */}
        <View>
          <Text
            className="text-[14px] font-JakartaSemiBold mb-2"
            style={{ color: textPrimary }}
          >
            Email (optional)
          </Text>
          <TextInput
            className="rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              color: textPrimary,
            }}
            placeholder="you@example.com"
            placeholderTextColor={textSecondary}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* City */}
        <View>
          <Text
            className="text-[14px] font-JakartaSemiBold mb-2"
            style={{ color: textPrimary }}
          >
            City
          </Text>
          <TextInput
            className="rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta"
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              color: textPrimary,
            }}
            placeholder="e.g. Dhaka"
            placeholderTextColor={textSecondary}
            value={city}
            onChangeText={setCity}
          />
        </View>

        {error ? (
          <Text
            className="text-[14px] font-Jakarta"
            style={{ color: colors.danger }}
          >
            {error}
          </Text>
        ) : null}

        <TouchableOpacity
          className="rounded-full w-full py-[16px] items-center"
          style={{
            backgroundColor: isBusy ? colors.borderDark : colors.primary,
          }}
          onPress={handleSave}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[16px] font-JakartaBold text-white">
              Save Changes
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
