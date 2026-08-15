import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/imageToURL";
import { logger } from "@/lib/logger";
import { colors, fonts, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

export default function DriverPersonalProfile() {
  const isDark = useIsDark();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surface = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const border = isDark ? colors.borderDark : colors.borderLight;
  const bg = isDark ? colors.bgDark : colors.bgLight;

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
    if (!name.trim()) { setError("Name is required"); return; }
    setError("");
    let profileImageUrl: string | null = null;

    if (photo && !photo.startsWith("http")) {
      setUploading(true);
      try {
        profileImageUrl = await uploadImage(photo, `profiles/${Date.now()}_${name.trim().replace(/\s+/g, "_")}.jpg`);
    } catch (_err: any) {
        setError("Failed to upload photo. Please try again.");
        setUploading(false);
        return;
      }
      setUploading(false);
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const body: Record<string, any> = { name: name.trim() };
      if (profileImageUrl) body.profile_image_url = profileImageUrl;
      if (city.trim()) body.city = city.trim();

      const res = await fetch(`${API_URL}/api/driver/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      router.push("/(main)/(rider)/onboarding");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Driver profile save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const isBusy = uploading || saving;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: border }}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ fontSize: 16, fontFamily: fonts.body, color: colors.primary }}>Back</Text>
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontFamily: fonts.heading, color: textPrimary }}>Complete Driver Profile</Text>
        <View style={{ width: 50 }} />
      </View>
      <ScrollView style={{ flex: 1, paddingHorizontal: 24 }} contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity onPress={pickImage} style={{ alignItems: "center", marginBottom: 24, marginTop: 16 }} disabled={isBusy}>
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: 96, height: 96, borderRadius: 48 }} />
          ) : (
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.accentLight, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 14, fontFamily: fonts.body, color: colors.primary }}>Upload Photo</Text>
            </View>
          )}
        </TouchableOpacity>
        {uploading && <Text style={{ textAlign: "center", fontSize: 12, fontFamily: fonts.body, color: textSecondary, marginBottom: 8 }}>Uploading photo...</Text>}

        <Text style={{ fontSize: 14, fontFamily: fonts.body, color: textSecondary, marginBottom: 8 }}>Name</Text>
        <TextInput
          style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: fonts.body, color: textPrimary, marginBottom: 16 }}
          placeholder="Enter your full name"
          placeholderTextColor={colors.textDisabledDark}
          value={name}
          onChangeText={setName}
        />
        <Text style={{ fontSize: 14, fontFamily: fonts.body, color: textSecondary, marginBottom: 8 }}>City</Text>
        <TextInput
          style={{ backgroundColor: surface, borderWidth: 1, borderColor: border, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: fonts.body, color: textPrimary, marginBottom: 16 }}
          placeholder="Select your operating city"
          placeholderTextColor={colors.textDisabledDark}
          value={city}
          onChangeText={setCity}
        />
        {error ? (
          <Text style={{ fontSize: 14, fontFamily: fonts.body, color: colors.danger, marginBottom: 12 }}>{error}</Text>
        ) : null}
        <TouchableOpacity
          style={{ borderRadius: radii.pill, paddingVertical: 16, alignItems: "center", backgroundColor: isBusy ? colors.borderDark : colors.primary }}
          onPress={handleSave}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size={20} color={colors.white} />
          ) : (
            <Text style={{ fontSize: 18, fontFamily: fonts.heading, color: colors.white }}>Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
