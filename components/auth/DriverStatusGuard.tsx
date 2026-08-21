import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, AppState } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useDriverFlowStore } from '@/store/useDriverFlowStore';
import { colors } from '@/theme/goRide';
import { useIsDark } from '@/lib/useAppearance';
import { logger } from '@/lib/logger';

interface Props {
  children: React.ReactNode;
}

/**
 * Guards the entire driver stack. Blocked drivers (pending, suspended,
 * rejected) see a status-specific screen instead of tabs.
 *
 * Enhancements over baseline:
 * - 30-second polling while in a blocked status so approval/rejection
 *   is detected without manual refresh.
 * - Dynamic rejection reason from driver.rejection_reason (if present).
 * - "Check Status" action that re-fetches the driver profile.
 */
export default function DriverStatusGuard({ children }: Props) {
  const { driver, fetchDriver } = useDriverFlowStore();
  const pathname = usePathname();
  const isDark = useIsDark();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  // ── Polling: re-fetch driver profile every 30s while blocked ──────
  const isBlocked =
    driver != null &&
    (driver.status === 'pending' ||
      driver.status === 'suspended' ||
      driver.status === 'rejected');

  useEffect(() => {
    if (!isBlocked) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      fetchDriver();
    }, 30_000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [isBlocked, fetchDriver]);

  // ── Check Status: manual refresh ──────────────────────────────────
  const handleCheckStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchDriver();
    } catch (e) {
      logger.error('[DriverStatusGuard] check status failed', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [fetchDriver]);

  // Initial load
  useEffect(() => {
    if (!driver) fetchDriver();
  }, [driver, fetchDriver]);

  // H2: AppState listener — re-check status when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchDriver();
      }
    });
    return () => sub.remove();
  }, [fetchDriver]);

  // Non-active drivers may only view the onboarding wizard and the
  // verification screen — the two screens that complete or track their
  // application. Everything else in the (rider) stack is gated.
  const onApplicationRoute =
    pathname.endsWith('/onboarding') ||
    pathname.includes('/onboarding/') ||
    pathname.endsWith('/verification') ||
    pathname.includes('/verification/');

  if (!driver) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text className="mt-4 text-[14px] font-Jakarta" style={{ color: textPrimary }}>
          Loading profile...
        </Text>
      </View>
    );
  }

  switch (driver.status) {
    case 'pending':
      if (onApplicationRoute) return <>{children}</>;
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.primaryLight }}
          >
            <Text className="text-[28px]">⏳</Text>
          </View>
          <Text className="text-[22px] font-JakartaBold mb-2" style={{ color: textPrimary }}>
            Verification in Progress
          </Text>
          <Text className="text-center text-[14px] font-Jakarta mb-6" style={{ color: textPrimary }}>
            Your documents are being reviewed. This usually takes 24-48 hours.
            We'll notify you once your account is approved.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[14px] items-center mb-3"
            onPress={handleCheckStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text className="text-[16px] font-JakartaBold text-goWhite">Check Status</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[14px] items-center"
            style={{ borderColor }}
            onPress={() => router.push('/(main)/(rider)/contact-support')}
          >
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              Contact Support
            </Text>
          </TouchableOpacity>
        </View>
      );

    case 'suspended':
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.dangerLight }}
          >
            <Text className="text-[28px]">🚫</Text>
          </View>
          <Text className="text-goDanger text-[22px] font-JakartaBold mb-2">
            Account Suspended
          </Text>
          <Text className="text-center text-[14px] font-Jakarta mb-2" style={{ color: textPrimary }}>
            Your account has been suspended. Please contact support for details.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[14px] items-center mb-3"
            onPress={handleCheckStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text className="text-[16px] font-JakartaBold text-goWhite">Check Status</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[14px] items-center"
            style={{ borderColor }}
            onPress={() => router.push('/(main)/(rider)/contact-support')}
          >
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              Contact Support
            </Text>
          </TouchableOpacity>
        </View>
      );

    case 'rejected':
      if (onApplicationRoute) return <>{children}</>;
      // Dynamic rejection reason: show the server-provided reason when available,
      // fall back to a generic message.
      const rejectionReason = (driver as unknown as Record<string, unknown>).rejection_reason;
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.dangerLight }}
          >
            <Text className="text-[28px]">📋</Text>
          </View>
          <Text className="text-goDanger text-[22px] font-JakartaBold mb-2">
            Documents Rejected
          </Text>
          {typeof rejectionReason === 'string' && rejectionReason.length > 0 ? (
            <View
              className="rounded-[12px] px-4 py-3 mb-4 w-full"
              style={{ backgroundColor: `${colors.danger}10`, borderColor: `${colors.danger}30`, borderWidth: 1 }}
            >
              <Text className="text-[13px] font-JakartaBold mb-1" style={{ color: colors.danger }}>
                Reason:
              </Text>
              <Text className="text-[13px] font-Jakarta" style={{ color: textPrimary }}>
                {rejectionReason}
              </Text>
            </View>
          ) : (
            <Text className="text-center text-[14px] font-Jakarta mb-4" style={{ color: textPrimary }}>
              Your submitted documents were not approved. Please re-submit with correct documents.
            </Text>
          )}
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[14px] items-center mb-3"
            onPress={() => router.push('/(main)/(rider)/onboarding')}
          >
            <Text className="text-[16px] font-JakartaBold text-goWhite">Re-upload Documents</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[14px] items-center mb-3"
            style={{ borderColor }}
            onPress={handleCheckStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={textPrimary} />
            ) : (
              <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
                Check Status
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[14px] items-center"
            style={{ borderColor }}
            onPress={() => router.push('/(main)/(rider)/contact-support')}
          >
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              Contact Support
            </Text>
          </TouchableOpacity>
        </View>
      );

    case 'temporary':
    case 'active':
      return <>{children}</>;

    // H2: Fail closed for unknown statuses — never grant full access
    default:
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <View
            className="w-16 h-16 rounded-full items-center justify-center mb-4"
            style={{ backgroundColor: colors.dangerLight }}
          >
            <Text className="text-[28px]">⚠️</Text>
          </View>
          <Text className="text-goDanger text-[22px] font-JakartaBold mb-2">
            Account Issue
          </Text>
          <Text className="text-center text-[14px] font-Jakarta mb-4" style={{ color: textPrimary }}>
            There is an issue with your account status. Please contact support for assistance.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[14px] items-center mb-3"
            onPress={handleCheckStatus}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text className="text-[16px] font-JakartaBold text-goWhite">Check Status</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[14px] items-center"
            style={{ borderColor }}
            onPress={() => router.push('/(main)/(rider)/contact-support')}
          >
            <Text className="text-[16px] font-JakartaBold" style={{ color: textPrimary }}>
              Contact Support
            </Text>
          </TouchableOpacity>
        </View>
      );
  }
}
