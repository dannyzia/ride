import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
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
import { useDriverFlowStore } from "@/store/useDriverFlowStore";
import { useTranslation } from "react-i18next";

type DriverStatus = "pending" | "temporary" | "active" | "suspended" | "rejected";

interface DocSummary {
  total: number;
  approved: number;
  pending: number;
  rejected: number;
  missing: number;
}

const POLL_INTERVAL_MS = 10_000;
const AUTO_NAVIGATE_DELAY_MS = 2_500;

export default function VerificationScreen() {
  const { t } = useTranslation();  const isDark = useIsDark();
  const fetchDriver = useDriverFlowStore((s) => s.fetchDriver);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark
    ? colors.textSecondaryDark
    : colors.textSecondaryLight;

  const [status, setStatus] = useState<DriverStatus | null>(null);
  const [docSummary, setDocSummary] = useState<DocSummary | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Celebration animation for approved state
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const apiFetch = useCallback(async (path: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("not_authenticated");
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return res.json();
  }, []);

  const fetchStatus = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else if (!status) setLoading(true);
    setError(null);
    try {
      const meData = await apiFetch("/api/driver/me");
      const driver = meData.driver;
      if (driver) {
        const newStatus = driver.status as DriverStatus;
        setStatus(newStatus);
        setRejectionReason(driver.rejection_reason ?? null);

        // Fetch document summary
        try {
          const docData = await apiFetch("/api/driver/documents");
          const docs = docData.documents ?? [];
          // Latest row per doc_type
          const latestByType: Record<string, { status: string }> = {};
          for (const doc of docs) {
            latestByType[doc.doc_type] = doc;
          }
          const allStatuses = Object.values(latestByType);
          const totalExpected = 12; // driver + vehicle doc slots
          const totalUploaded = allStatuses.length;
          setDocSummary({
            total: totalExpected,
            approved: allStatuses.filter((d) => d.status === "approved").length,
            pending: allStatuses.filter((d) => d.status === "pending").length,
            rejected: allStatuses.filter((d) => d.status === "rejected").length,
            missing: totalExpected - totalUploaded,
          });
        } catch {
          // Non-critical — doc summary is informational
        }
      }
    } catch (err) {
      logger.error("[verification] fetch failed", { error: String(err) });
      setError("Failed to load verification status");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiFetch, status]);

  // Initial fetch
  useEffect(() => {
    void fetchStatus(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-poll while pending
  useEffect(() => {
    if (status !== "pending") return;
    const interval = setInterval(() => {
      void fetchStatus(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, fetchStatus]);

  // Auto-navigate when approved
  useEffect(() => {
    if (status !== "active") return;
    // Celebration animation
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();

    const timer = setTimeout(() => {
      void fetchDriver();
      router.replace("/(main)/(rider)/(tabs)");
    }, AUTO_NAVIGATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, fetchDriver, scaleAnim, opacityAnim]);

  // Redirect temporary to onboarding
  useEffect(() => {
    if (status === "temporary") {
      router.replace("/(main)/(rider)/onboarding");
    }
  }, [status]);

  const handleRefresh = () => void fetchStatus(true);

  const handleContactSupport = () => router.push("/(main)/(rider)/contact-support");
  const handleReupload = () => router.push("/(main)/(rider)/onboarding");
  const handleGoHome = () => {
    void fetchDriver();
    router.replace("/(main)/(rider)/(tabs)");
  };

  // ─── Loading ───
  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textSecondary,
              marginTop: spacing.md,
            }}
          >
            Checking verification status…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Error ───
  if (error && !status) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
        <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
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
            {error}
          </Text>
          <TouchableOpacity
            onPress={handleRefresh}
            style={{
              marginTop: spacing.lg,
              paddingHorizontal: spacing.xl,
              paddingVertical: spacing.md,
              borderRadius: radii.pill,
              backgroundColor: colors.primary,
            }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading verification status"
          >
            <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 14, color: colors.white }}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Status-specific content ───
  const isPending = status === "pending";
  const isApproved = status === "active";
  const isRejected = status === "rejected";
  const isSuspended = status === "suspended";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* Header */}
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
        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontFamily: "Jakarta-Bold",
            fontSize: 17,
            color: textPrimary,
          }}
        >
          Verification Status
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing["4xl"] }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Status card */}
        <View
          style={{
            backgroundColor: surfaceBg,
            borderWidth: 1,
            borderColor,
            borderRadius: radii.lg,
            padding: spacing.xl,
            alignItems: "center",
            marginBottom: spacing.xl,
          }}
        >
          {/* Icon */}
          <Animated.View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: isApproved
                ? colors.success + "1A"
                : isRejected || isSuspended
                  ? colors.danger + "1A"
                  : colors.primaryLight,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: spacing.lg,
              transform: isApproved ? [{ scale: scaleAnim }] : undefined,
              opacity: isApproved ? opacityAnim : undefined,
            }}
          >
            <Ionicons
              name={
                isApproved
                  ? "checkmark-circle"
                  : isRejected
                    ? "close-circle"
                    : isSuspended
                      ? "ban"
                      : "time"
              }
              size={40}
              color={
                isApproved
                  ? colors.success
                  : isRejected || isSuspended
                    ? colors.danger
                    : colors.primary
              }
            />
          </Animated.View>

          {/* Title */}
          <Text
            style={{
              fontFamily: "Jakarta-Bold",
              fontSize: 20,
              color: isApproved
                ? colors.success
                : isRejected || isSuspended
                  ? colors.danger
                  : textPrimary,
              marginBottom: spacing.sm,
              textAlign: "center",
            }}
          >
            {isApproved
              ? "Account Approved!"
              : isRejected
                ? "Documents Rejected"
                : isSuspended
                  ? "Account Suspended"
                  : "Under Review"}
          </Text>

          {/* Subtitle */}
          <Text
            style={{
              fontFamily: "Jakarta-Regular",
              fontSize: 14,
              color: textSecondary,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            {isApproved
              ? "Your account is verified. You can start accepting rides now!"
              : isRejected
                ? rejectionReason
                  ? "Your documents were not approved. See the reason below."
                  : "Your submitted documents were not approved. Please re-submit."
                : isSuspended
                  ? "Your account has been suspended. Please contact support."
                  : "Your documents are being reviewed. This usually takes 24-48 hours."}
          </Text>

          {/* Rejection reason box */}
          {isRejected && rejectionReason && (
            <View
              style={{
                marginTop: spacing.md,
                backgroundColor: colors.danger + "10",
                borderColor: colors.danger + "30",
                borderWidth: 1,
                borderRadius: radii.md,
                padding: spacing.md,
                width: "100%",
              }}
            >
              <Text
                style={{
                  fontFamily: "Jakarta-SemiBold",
                  fontSize: 13,
                  color: colors.danger,
                  marginBottom: spacing.xs,
                }}
              >
                Rejection Reason
              </Text>
              <Text
                style={{
                  fontFamily: "Jakarta-Regular",
                  fontSize: 13,
                  color: textPrimary,
                  lineHeight: 18,
                }}
              >
                {rejectionReason}
              </Text>
            </View>
          )}

          {/* Pending: pulsing indicator */}
          {isPending && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginTop: spacing.md,
                gap: spacing.sm,
              }}
            >
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={{
                  fontFamily: "Jakarta-Medium",
                  fontSize: 12,
                  color: colors.primary,
                }}
              >
                Auto-refreshing every 10s
              </Text>
            </View>
          )}
        </View>

        {/* Document summary */}
        {docSummary && (
          <View
            style={{
              backgroundColor: surfaceBg,
              borderWidth: 1,
              borderColor,
              borderRadius: radii.lg,
              padding: spacing.lg,
              marginBottom: spacing.xl,
            }}
          >
            <Text
              style={{
                fontFamily: "Jakarta-Bold",
                fontSize: 15,
                color: textPrimary,
                marginBottom: spacing.md,
              }}
            >
              Document Summary
            </Text>

            {[
              {
                label: "Approved",
                count: docSummary.approved,
                color: colors.success,
                icon: "checkmark-circle" as const,
              },
              {
                label: "Pending Review",
                count: docSummary.pending,
                color: colors.amber,
                icon: "time" as const,
              },
              {
                label: "Rejected",
                count: docSummary.rejected,
                color: colors.danger,
                icon: "close-circle" as const,
              },
              {
                label: "Not Uploaded",
                count: docSummary.missing,
                color: textSecondary,
                icon: "document-outline" as const,
              },
            ].map((item) => (
              <View
                key={item.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: borderColor,
                }}
              >
                <Ionicons name={item.icon} size={16} color={item.color} />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: "Jakarta-Regular",
                    fontSize: 14,
                    color: textPrimary,
                    marginLeft: spacing.md,
                  }}
                >
                  {item.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Jakarta-SemiBold",
                    fontSize: 14,
                    color: item.color,
                  }}
                >
                  {item.count}/{docSummary.total}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Actions */}
        <View style={{ gap: spacing.md }}>
          {isApproved && (
            <TouchableOpacity
              onPress={handleGoHome}
              style={{
                backgroundColor: colors.primary,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Go to home screen"
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.white }}>
                Go to Home
              </Text>
            </TouchableOpacity>
          )}

          {(isRejected || isSuspended) && (
            <TouchableOpacity
              onPress={handleReupload}
              style={{
                backgroundColor: colors.primary,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Re-upload documents"
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.white }}>
                {isRejected ? "Re-upload Documents" : "Contact Support"}
              </Text>
            </TouchableOpacity>
          )}

          {isPending && (
            <TouchableOpacity
              onPress={handleRefresh}
              style={{
                backgroundColor: colors.primary,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
                alignItems: "center",
                opacity: refreshing ? 0.5 : 1,
              }}
              disabled={refreshing}
              accessibilityRole="button"
              accessibilityLabel="Refresh verification status"
            >
              {refreshing ? (
                <ActivityIndicator size={20} color={colors.white} />
              ) : (
                <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: colors.white }}>
                  Refresh Status
                </Text>
              )}
            </TouchableOpacity>
          )}

          {(isRejected || isSuspended) && (
            <TouchableOpacity
              onPress={handleContactSupport}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Contact support"
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary }}>
                Contact Support
              </Text>
            </TouchableOpacity>
          )}

          {isPending && (
            <TouchableOpacity
              onPress={handleContactSupport}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: radii.pill,
                paddingVertical: spacing.lg,
                alignItems: "center",
              }}
              accessibilityRole="button"
              accessibilityLabel="Contact support"
            >
              <Text style={{ fontFamily: "Jakarta-Bold", fontSize: 16, color: textPrimary }}>
                Contact Support
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Info box */}
        <View
          style={{
            marginTop: spacing.xl,
            backgroundColor: isDark ? colors.surfaceElevatedDark + "80" : colors.primaryLight + "40",
            borderRadius: radii.md,
            padding: spacing.md,
            flexDirection: "row",
            gap: spacing.md,
          }}
        >
          <Ionicons name="information-circle" size={18} color={colors.primary} />
          <Text
            style={{
              flex: 1,
              fontFamily: "Jakarta-Regular",
              fontSize: 13,
              color: textSecondary,
              lineHeight: 18,
            }}
          >
            {isPending
              ? "You'll receive a push notification once your account is approved. You can also check back here anytime."
              : isApproved
                ? "Make sure your documents stay up to date. Expired documents may result in account suspension."
                : "If you believe this is an error, please contact our support team with your correct documents."}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
