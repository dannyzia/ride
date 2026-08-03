import { useState } from "react";
import { API_URL } from "@/lib/config";
import { View, Text, TouchableOpacity, ScrollView, Image, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { useRiderStore } from "@/store/useRiderStore";

export default function SettingsPersonalInfo() {
  const { name, photo, setRider } = useRiderStore();
  const [localName, setLocalName] = useState(name || "");
  const [localPhoto, setLocalPhoto] = useState<string | null>(photo ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setLocalPhoto(result.assets[0].uri);
      }
    } catch (err) {
      logger.error("Image pick failed", err);
    }
  };

  const saveChanges = async () => {
    if (!localName.trim()) { setError("Name is required"); return; }
    setLoading(true); setError(""); setSuccessMessage("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError("Not authenticated"); return; }
      const res = await fetch(`${API_URL}/api/user/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: localName.trim(), profile_image_url: localPhoto }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to save"); return; }
      if (setRider) setRider({ name: localName.trim(), photo: localPhoto ?? undefined } as any);
      setSuccessMessage("Profile updated successfully!");
    } catch (err: any) {
      setError(err?.message || "Network error");
      logger.error("Profile save failed", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgLight dark:bg-goBgDark">
      <View className="flex-row items-center px-[24px] py-[16px] border-b border-goBorderLight dark:border-goBorderDark">
        <TouchableOpacity onPress={() => router.back()}>
          <Text className="text-[16px] font-Jakarta text-goPrimary">Back</Text>
        </TouchableOpacity>
        <Text className="flex-1 text-center text-[18px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">Personal Info</Text>
        <View className="w-[50px]" />
      </View>
      <ScrollView className="flex-1 px-[24px]" contentContainerStyle={{ paddingVertical: 24 }}>
        <View className="items-center mb-6">
          <TouchableOpacity onPress={pickImage} className="mb-4">
            {localPhoto ? (
              <Image
                source={{ uri: localPhoto }}
                className="w-24 h-24 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-goAccentLight items-center justify-center">
                <Text className="text-[14px] font-Jakarta text-goPrimary">+ Photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <Text className="text-[16px] font-JakartaBold text-goTextPrimaryLight dark:text-goTextPrimaryDark">
            {localName || "Add Name"}
          </Text>
        </View>
        <View className="mb-4">
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Name</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextPrimaryLight dark:text-goTextPrimaryDark"
            placeholder="Enter your name"
            placeholderTextColor="#9CA3AF"
            value={localName}
            onChangeText={setLocalName}
          />
        </View>
        <View className="mb-4">
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Email</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark"
            placeholder="Not set"
            placeholderTextColor="#9CA3AF"
            editable={false}
          />
        </View>
        <View className="mb-6">
          <Text className="text-[14px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark mb-2">Phone Number</Text>
          <TextInput
            className="bg-goSurfaceLight dark:bg-goSurfaceElevatedDark border border-goBorderLight dark:border-goBorderDark rounded-[10px] px-[16px] py-[14px] text-[15px] font-Jakarta text-goTextSecondaryLight dark:text-goTextSecondaryDark"
            placeholder="Not set"
            placeholderTextColor="#9CA3AF"
            editable={false}
          />
        </View>
        {error ? (
          <Text className="text-[14px] font-Jakarta text-goDanger mb-3 text-center">{error}</Text>
        ) : null}
        {successMessage ? (
          <Text className="text-[14px] font-Jakarta text-goPrimary mb-3 text-center">{successMessage}</Text>
        ) : null}
        <TouchableOpacity
          className={`rounded-full py-[16px] items-center ${loading ? "bg-goBorderDark" : "bg-goPrimary"}`}
          onPress={saveChanges}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size={20} color="#FFFFFF" />
          ) : (
            <Text className="text-[18px] font-JakartaBold text-goWhite">Save Changes</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
