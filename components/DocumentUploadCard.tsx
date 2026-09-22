import { useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import Ionicons from "@expo/vector-icons/Ionicons";
import { uploadImageToR2 } from "@/lib/imageToURL";
import { logger } from "@/lib/logger";
import { colors, spacing, radii } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface DocumentUploadCardProps {
  docType: string;
  label: string;
  folder?: "documents" | "vehicle";
  onUploadComplete: (path: string, url: string, fileSizeBytes: number) => void;
}

export default function DocumentUploadCard({ docType, label, folder, onUploadComplete }: DocumentUploadCardProps) {
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

      const result2 = await uploadImageToR2({
        localUri: file.uri,
        folder: folder ?? "documents",
        fileName: file.fileName ?? `document_${Date.now()}.jpg`,
        mimeType: file.mimeType,
      });

      setPreviewUri(file.uri);
      onUploadComplete(result2.key, result2.publicUrl, result2.fileSizeBytes);
      logger.info("[DocumentUploadCard] upload complete", { docType, key: result2.key });
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
