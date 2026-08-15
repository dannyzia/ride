import { useCallback, useEffect, useState } from "react";
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
import VerificationStep from "@/components/VerificationStep";

interface DriverMe {
  status: string;
}

interface DocRow {
  id: string;
  doc_type: string;
  status: string;
  created_at: string | null;
}

const EXPECTED_DOC_KEYS = [
  "nid_front",
  "nid_back",
  "license_front",
  "license_back",
  "reg_scan_front",
  "reg_scan_back",
  "brta_certificate",
];

class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function authedGet(path: string): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new ApiError("not_authenticated", "Not authenticated");
  }
  return fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default function VerificationScreen() {
  const isDark = useIsDark();
  const [driver, setDriver] = useState<DriverMe | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const fetchAll = useCallback(async (showRefresh: boolean) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [meRes, docsRes] = await Promise.all([
        authedGet("/api/driver/me"),
        authedGet("/api/driver/documents"),
      ]);
      if (!meRes.ok || !docsRes.ok) {
        const failed = meRes.ok ? docsRes : meRes;
        const data = await failed.json().catch(() => ({}));
        throw new ApiError(
          typeof data.error === "string" ? data.error : `http_${failed.status}`,
          typeof data.message === "string"
            ? data.message
            : "Failed to load verification status",
        );
      }
      const meData = await meRes.json();
      const docsData = await docsRes.json();
      setDriver(meData.driver ?? null);
      setDocs(docsData.documents ?? []);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { code: err.code, message: err.message }
          : {
              code: "network_error",
              message: err instanceof Error ? err.message : "Network error",
            },
      );
      logger.error("[verification] fetch failed", { error: String(err) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll(false);
  }, [fetchAll]);

  const latestByType = docs.reduce<Record<string, DocRow>>((acc, row) => {
    acc[row.doc_type] = row;
    return acc;
  }, {});

  const driverStatus = driver?.status ?? "";
  const isActive = driverStatus === "active";
  const approvedCount = EXPECTED_DOC_KEYS.filter(
    (k) => latestByType[k]?.status === "approved",
  ).length;
  const submittedCount = EXPECTED_DOC_KEYS.filter(
    (k) => latestByType[k] != null,
  ).length;

  const step1Status =
    driverStatus && driverStatus !== "temporary" ? "completed" : "current";
  const step2Status =
    approvedCount === EXPECTED_DOC_KEYS.length
      ? "completed"
      : submittedCount === EXPECTED_DOC_KEYS.length
        ? "current"
        : "pending";
  const step2Subtitle =
    approvedCount === EXPECTED_DOC_KEYS.length
      ? `${approvedCount}/${EXPECTED_DOC_KEYS.length} approved`
      : submittedCount === EXPECTED_DOC_KEYS.length
        ? `${approvedCount}/${EXPECTED_DOC_KEYS.length} approved`
        : "Missing documents — complete onboarding";
  const step3Status = isActive ? "completed" : "current";

  const contactSupport = () => router.push("/(main)/(rider)/support");

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
          Verification
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Refresh verification status"
          onPress={() => void fetchAll(true)}
          style={{ padding: spacing.xs }}
        >
          <Ionicons name="refresh" size={22} color={textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : error ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: spacing.xl,
          }}
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
            accessibilityLabel="Retry loading verification status"
            onPress={() => void fetchAll(false)}
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
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: spacing["4xl"],
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void fetchAll(true)}
              tintColor={colors.primary}
            />
          }
        >
          <View style={{ alignItems: "center", marginBottom: spacing.xl }}>
            <Ionicons
              name="shield-checkmark"
              size={64}
              color={isActive ? colors.success : colors.primary}
            />
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 22,
                color: isActive ? colors.success : textPrimary,
                marginTop: spacing.md,
                textAlign: "center",
              }}
            >
              {isActive ? "Account Active" : "Account Under Review"}
            </Text>
            {!isActive && (
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 14,
                  color: textSecondary,
                  marginTop: spacing.sm,
                  textAlign: "center",
                }}
              >
                Your submission is being reviewed — usually 1–2 business days.
              </Text>
            )}
          </View>

          <View style={{ marginBottom: spacing.xl }}>
            <VerificationStep
              status={step1Status}
              title="Profile submitted"
              subtitle={
                step1Status === "completed"
                  ? undefined
                  : "Complete your profile in onboarding"
              }
            />
            <VerificationStep
              status={step2Status}
              title="Documents under review"
              subtitle={step2Subtitle}
            />
            <VerificationStep
              status={step3Status}
              title="Admin review & activation"
              subtitle="Admin reviews and activates manually — usually 1–2 business days"
              isLast
            />
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Contact support"
            onPress={contactSupport}
            style={{
              borderWidth: 1.5,
              borderColor: colors.primary,
              borderRadius: radii.pill,
              paddingVertical: spacing.md,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 15,
                color: colors.primary,
              }}
            >
              Contact Support
            </Text>
          </TouchableOpacity>

          <View style={{ marginTop: spacing.xl }}>
            <ThemeToggle />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
