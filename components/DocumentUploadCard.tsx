import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DocumentUploadCardProps {
  docType: string;
  label: string;
  onUploadComplete: (path: string, url: string) => void;
}

export default function DocumentUploadCard({ docType, label, onUploadComplete }: DocumentUploadCardProps) {
  const [uploading, setUploading] = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  // H3: surface upload failures instead of silently logging them.
  const [uploadError, setUploadError] = useState<string | null>(null);
  const isDark = useIsDark();

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
      setUploadError(null);

      // H2: scope the storage path with the authenticated user id so one
      // driver's documents can never collide with another's, and drop
      // upsert:true so a (timestamped) collision errors loudly instead of
      // silently overwriting an existing document.
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user?.id ?? "anonymous";
      const safeName = (file.fileName ?? "document.jpg").replace(/[^\w.\-]/g, "_");
      const fileName = `${userId}/${docType}/${Date.now()}_${safeName}`;

      const response = await fetch(file.uri);
      const blob = await response.blob();

      const { data, error } = await supabase.storage
        .from("driver-documents")
        .upload(fileName, blob);

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from("driver-documents")
        .getPublicUrl(data.path);

      setPreviewUri(file.uri);
      onUploadComplete(data.path, publicUrlData.publicUrl);
      logger.info("[DocumentUploadCard] upload complete", { docType, path: data.path });
    } catch (e) {
      logger.error("[DocumentUploadCard] upload failed", { docType, error: e instanceof Error ? e.message : String(e) });
      setUploadError("Upload failed — tap to try again");
    } finally {
      setUploading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePick}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={`Upload ${label}`}
      style={{
        backgroundColor: bg,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: borderColor,
        borderRadius: radii["2xl"],
        padding: spacing.lg,
        marginBottom: spacing.md,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, marginRight: spacing.md }}>
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 14,
              color: textPrimary,
            }}
          >
            {label}
          </Text>
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 12,
              color: uploadError ? colors.danger : textSecondary,
              marginTop: 2,
            }}
          >
            {uploading
              ? "Uploading..."
              : uploadError
                ? uploadError
                : previewUri
                  ? "Tap to replace document"
                  : "Tap to upload document"}
          </Text>
        </View>
        {uploading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={{
              width: 72,
              height: 72,
              borderRadius: radii.md,
              borderWidth: 1,
              borderColor: borderColor,
            }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.primary + "15",
            }}
          >
            <Ionicons name="add" size={20} color={colors.primary} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
