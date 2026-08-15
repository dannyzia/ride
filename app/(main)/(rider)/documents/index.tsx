import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
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
import { colors, radii, spacing } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";
import ThemeToggle from "@/components/ThemeToggle";

interface DocRow {
  id: string;
  doc_type: string;
  status: string;
  storage_url: string | null;
  rejection_reason: string | null;
  created_at: string | null;
}

const DRIVER_DOC_KEYS = [
  "nid_front",
  "nid_back",
  "license_front",
  "license_back",
  "driver_photo",
];

const VEHICLE_DOC_KEYS = [
  "reg_scan_front",
  "reg_scan_back",
  "brta_certificate",
  "vehicle_photo_front",
  "vehicle_photo_left",
  "vehicle_photo_back",
  "vehicle_photo_right",
];

const LEGACY_DOC_KEYS = [
  "uber_screenshot",
  "pathao_screenshot",
  "obhai_screenshot",
  "indrive_screenshot",
  "legacy_screenshot",
];

const DOC_LABELS: Record<string, string> = {
  nid_front: "NID (Front)",
  nid_back: "NID (Back)",
  license_front: "Driving License (Front)",
  license_back: "Driving License (Back)",
  driver_photo: "Driver Photo",
  reg_scan_front: "Registration (Front)",
  reg_scan_back: "Registration (Back)",
  brta_certificate: "BRTA Enlistment Certificate",
  vehicle_photo_front: "Vehicle Photo (Front)",
  vehicle_photo_left: "Vehicle Photo (Left)",
  vehicle_photo_back: "Vehicle Photo (Back)",
  vehicle_photo_right: "Vehicle Photo (Right)",
  uber_screenshot: "Uber Screenshot",
  pathao_screenshot: "Pathao Screenshot",
  obhai_screenshot: "Obhai Screenshot",
  indrive_screenshot: "Indrive Screenshot",
  legacy_screenshot: "Legacy Platform Screenshot",
};

type BadgeTone = "approved" | "pending" | "rejected" | "missing";

export default function DocumentsScreen() {
  const isDark = useIsDark();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchDocuments = useCallback(async (showRefresh: boolean) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError({
          code: "not_authenticated",
          message: "Not authenticated",
        });
        return;
      }
      const res = await fetch(`${API_URL}/api/driver/documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError({
          code: typeof data.error === "string" ? data.error : `http_${res.status}`,
          message:
            typeof data.message === "string"
              ? data.message
              : "Failed to load documents",
        });
        return;
      }
      const data = await res.json();
      setDocs(data.documents ?? []);
    } catch (err) {
      setError({
        code: "network_error",
        message: err instanceof Error ? err.message : "Network error",
      });
      logger.error("[documents] fetch failed", { error: String(err) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocuments(false);
  }, [fetchDocuments]);

  // Latest row per doc_type (API returns rows ordered by created_at ascending)
  const latestByType = docs.reduce<Record<string, DocRow>>((acc, row) => {
    acc[row.doc_type] = row;
    return acc;
  }, {});

  const legacyRows = LEGACY_DOC_KEYS.filter((k) => latestByType[k] != null);

  const badgeFor = (key: string): { tone: BadgeTone; label: string; row: DocRow | null } => {
    const row = latestByType[key] ?? null;
    if (!row) return { tone: "missing", label: "Not Uploaded", row: null };
    if (row.status === "approved")
      return { tone: "approved", label: "Verified", row };
    if (row.status === "rejected")
      return { tone: "rejected", label: "Rejected", row };
    return { tone: "pending", label: "Pending", row };
  };

  const badgeStyle = (tone: BadgeTone) => {
    switch (tone) {
      case "approved":
        return { fg: colors.success, bg: colors.success + "26" };
      case "pending":
        return { fg: colors.amber, bg: colors.amber + "26" };
      case "rejected":
        return { fg: colors.danger, bg: colors.dangerLight + "26" };
      case "missing":
        return { fg: textSecondary, bg: isDark ? colors.darkSurface : colors.gray100 };
    }
  };

  const goToOnboarding = () => router.push("/(main)/(rider)/onboarding");

  const renderRow = (key: string, iconName: keyof typeof Ionicons.glyphMap) => {
    const label = DOC_LABELS[key] ?? key;
    const badge = badgeFor(key);
    const style = badgeStyle(badge.tone);
    return (
      <View
        key={key}
        style={{
          backgroundColor: surfaceBg,
          borderWidth: 1,
          borderColor,
          borderRadius: radii.md,
          padding: spacing.md,
          marginBottom: spacing.sm,
          opacity: badge.tone === "missing" ? 0.75 : 1,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name={iconName as any} size={20} color={textSecondary} />
          <Text
            style={{
              flex: 1,
              fontFamily: "Jakarta-SemiBold",
              fontSize: 14,
              color: textPrimary,
              marginLeft: spacing.md,
            }}
          >
            {label}
          </Text>
          {badge.tone === "missing" ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={`Upload ${label}`}
              onPress={goToOnboarding}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: colors.primary,
                }}
              >
                Upload
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={{
                backgroundColor: style.bg,
                borderRadius: radii.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: 3,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 12,
                  color: style.fg,
                }}
              >
                {badge.label}
              </Text>
            </View>
          )}
        </View>
        {badge.tone === "rejected" && badge.row?.rejection_reason && (
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 13,
              color: colors.danger,
              marginTop: spacing.xs,
              marginLeft: 32,
            }}
          >
            {badge.row.rejection_reason}
          </Text>
        )}
      </View>
    );
  };

  const renderGroup = (title: string, keys: string[], iconName: keyof typeof Ionicons.glyphMap) => (
    <View style={{ marginBottom: spacing.lg }}>
      <Text
        style={{
          fontFamily: "Jakarta-Bold",
          fontSize: 15,
          color: textPrimary,
          marginBottom: spacing.md,
        }}
      >
        {title}
      </Text>
      {keys.map((k) => renderRow(k, iconName))}
    </View>
  );

  const section = (children: ReactNode) => (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: spacing.lg,
        paddingBottom: spacing["4xl"],
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void fetchDocuments(true)}
          tintColor={colors.primary}
        />
      }
    >
      {children}
      <ThemeToggle />
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: borderColor,
        }}
      >
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={{ padding: spacing.xs }}
        >
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "Jakarta-Bold",
            fontSize: 17,
            color: textPrimary,
          }}
        >
          Documents
        </Text>
        <View style={{ width: 32 }} />
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}
        >
          <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
          <Text
            style={{
              fontFamily: "Jakarta-SemiBold",
              fontSize: 15,
              color: textPrimary,
              marginTop: spacing.md,
              textAlign: "center",
            }}
          >
            {`${error.code}: ${error.message}`}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Retry loading documents"
            onPress={() => void fetchDocuments(false)}
            style={{
              marginTop: spacing.lg,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 14,
                color: colors.white,
              }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      ) : docs.length === 0 ? (
        section(
          <View
            style={{ alignItems: "center", paddingVertical: spacing["4xl"] }}
          >
            <Ionicons
              name="document-text-outline"
              size={56}
              color={textSecondary}
            />
            <Text
              style={{
                fontFamily: "Jakarta-SemiBold",
                fontSize: 16,
                color: textPrimary,
                marginTop: spacing.lg,
                textAlign: "center",
              }}
            >
              No documents uploaded yet
            </Text>
            <Text
              style={{
                fontFamily: "Jakarta-Regular",
                fontSize: 14,
                color: textSecondary,
                marginTop: spacing.sm,
                textAlign: "center",
              }}
            >
              Complete onboarding to submit your documents for verification.
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start onboarding"
              onPress={goToOnboarding}
              style={{
                marginTop: spacing.xl,
                paddingHorizontal: spacing["3xl"],
                paddingVertical: spacing.md,
                borderRadius: radii.pill,
                backgroundColor: colors.primary,
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-Bold",
                  fontSize: 14,
                  color: colors.white,
                }}
              >
                Start Onboarding
              </Text>
            </TouchableOpacity>
          </View>,
        )
      ) : (
        section(
          <View>
            {renderGroup("Driver Documents", DRIVER_DOC_KEYS, "card")}
            {renderGroup("Vehicle Documents", VEHICLE_DOC_KEYS, "car")}
            {legacyRows.length > 0 &&
              renderGroup("Legacy Platforms", legacyRows, "apps")}
          </View>,
        )
      )}
    </SafeAreaView>
  );
}
