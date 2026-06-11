import { Stack } from 'expo-router';
import { colors } from '@/theme/goRide';

/**
 * Shared auth layout for phone-entry, otp-verify, and register screens.
 * Provides consistent header styling and navigation transitions.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bgLight },
        animation: 'slide_from_right',
      }}
    />
  );
}
