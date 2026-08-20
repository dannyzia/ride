import { useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useDriverFlowStore } from '@/store/useDriverFlowStore';
import { colors } from '@/theme/goRide';
import { useIsDark } from '@/lib/useAppearance';

interface Props {
  children: React.ReactNode;
}

export default function DriverStatusGuard({ children }: Props) {
  const { driver, fetchDriver } = useDriverFlowStore();
  const pathname = usePathname();
  const isDark = useIsDark();

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;

  useEffect(() => {
    if (!driver) fetchDriver();
  }, [driver, fetchDriver]);

  // Non-active drivers may only view the onboarding wizard and the
  // verification screen — the two screens that complete or track their
  // application. Everything else in the (rider) stack is gated. Without this,
  // the wizard's exit to /verification (and the guard's own "Upload
  // Documents" button) would be bricked behind the same guard (C-1).
  const onApplicationRoute =
    pathname.endsWith('/onboarding') ||
    pathname.includes('/onboarding/') ||
    pathname.endsWith('/verification') ||
    pathname.includes('/verification/');

  if (!driver) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: bg }}>
        <ActivityIndicator size="large" color={colors.textDisabledDark} />
        <Text className="mt-4 text-[14px] font-Jakarta" style={{ color: textPrimary }}>Loading profile...</Text>
      </View>
    );
  }

  switch (driver.status) {
    case 'pending':
      if (onApplicationRoute) return <>{children}</>;
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <Text className="text-[22px] font-JakartaBold mb-4" style={{ color: textPrimary }}>Welcome!</Text>
          <Text className="text-center text-[14px] font-Jakarta mb-8" style={{ color: textPrimary }}>
            Your account is pending verification. Please upload the required documents to start receiving ride offers.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center"
            onPress={() => router.push("/(main)/(rider)/onboarding")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Upload Documents</Text>
          </TouchableOpacity>
        </View>
      );

    case 'suspended':
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <Text className="text-goDanger text-[22px] font-JakartaBold mb-4">Account Suspended</Text>
          <Text className="text-center text-[14px] font-Jakarta mb-8" style={{ color: textPrimary }}>
            Your account has been suspended. Please contact support for assistance.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center"
            onPress={() => router.push("/(main)/(rider)/contact-support")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Contact Support</Text>
          </TouchableOpacity>
        </View>
      );

    case 'rejected':
      if (onApplicationRoute) return <>{children}</>;
      return (
        <View className="flex-1 items-center justify-center px-[24px]" style={{ backgroundColor: bg }}>
          <Text className="text-goDanger text-[22px] font-JakartaBold mb-4">Documents Rejected</Text>
          <Text className="text-center text-[14px] font-Jakarta mb-4" style={{ color: textPrimary }}>
            Your submitted documents were not approved. Please re-submit with correct documents.
          </Text>
          <TouchableOpacity
            className="bg-goPrimary rounded-full w-full py-[16px] items-center"
            onPress={() => router.push("/(main)/(rider)/onboarding")}
          >
            <Text className="text-[18px] font-JakartaBold text-goWhite">Re-upload Documents</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className="border rounded-full w-full py-[16px] items-center mt-3"
            style={{ borderColor }}
            onPress={() => router.push("/(main)/(rider)/contact-support")}
          >
            <Text className="text-[18px] font-JakartaBold" style={{ color: textPrimary }}>Contact Support</Text>
          </TouchableOpacity>
        </View>
      );

    case 'temporary':
    case 'active':
      return <>{children}</>;

    default:
      return <>{children}</>;
  }
}
