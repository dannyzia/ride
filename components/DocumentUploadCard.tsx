import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

interface DocumentUploadCardProps {
  docType: string;
  label: string;
  onUploadComplete: (path: string, url: string) => void;
}

export default function DocumentUploadCard({ docType, label, onUploadComplete }: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const handlePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const file = result.assets[0];
      setUploading(true);

      const response = await fetch(file.uri);
      const blob = await response.blob();
      const fileName = `${docType}/${Date.now()}_${file.fileName ?? "document.jpg"}`;

      const { data, error } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob, { upsert: true });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(data.path);

      onUploadComplete(data.path, publicUrlData.publicUrl);
      logger.info("[DocumentUploadCard] upload complete", { docType, path: data.path });
    } catch (e: any) {
      logger.error("[DocumentUploadCard] upload failed", { docType, error: e.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePick}
      disabled={uploading}
      className="flex-row items-center justify-between p-4 mb-3 rounded-2xl border border-dashed"
      style={{
        backgroundColor: bg,
        borderColor: borderColor,
      }}
    >
      <View className="flex-1 mr-3">
        <Text
          className="text-sm font-JakartaBold"
          style={{ color: textPrimary }}
        >
          {label}
        </Text>
        <Text
          className="text-xs font-Jakarta mt-0.5"
          style={{ color: textSecondary }}
        >
          {uploading ? "Uploading..." : "Tap to upload document"}
        </Text>
      </View>
      {uploading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <View
          className="w-8 h-8 rounded-full items-center justify-center"
          style={{ backgroundColor: colors.primary + "15" }}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </View>
      )}
    </TouchableOpacity>
  );
}
