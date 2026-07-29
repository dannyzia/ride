import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { uploadImage } from "@/lib/imageToURL";
import { logger } from "@/lib/logger";

export default function DriverPersonalProfile() {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

      const res = await fetch(`${process.env.EXPO_PUBLIC_SERVER_URL}/api/driver/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      router.push("/(main)/(rider)/onboarding/documents");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Driver profile save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const isBusy = uploading || saving;

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Complete Driver Profile</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingBottom: 40 }}>
        <TouchableOpacity onPress={pickImage} className="items-center mb-6 mt-4" disabled={isBusy}>
          {photo ? (
            <Image source={{ uri: photo }} className="w-24 h-24 rounded-full" />
          ) : (
            <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center">
              <Text className="text-[14px] font-Jakarta text-goPrimary">Upload Photo</Text>
            </View>
          )}
        </TouchableOpacity>
        {uploading && <Text className="text-center text-[12px] font-Jakarta text-goTextSecondaryLight mb-2">Uploading photo...</Text>}

        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Name</Text>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
          placeholder="Enter your full name"
          placeholderTextColor="#9CA3AF"
          value={name}
          onChangeText={setName}
        />
        <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">City</Text>
        <TextInput
          className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark mb-4"
          placeholder="Select your operating city"
          placeholderTextColor="#9CA3AF"
          value={city}
          onChangeText={setCity}
        />
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-3">{error}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center ${isBusy ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={handleSave}
          disabled={isBusy}
        >
          {isBusy ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Continue</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
