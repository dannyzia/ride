import { useEffect } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/goRide';
import { useIsDark } from '@/lib/useAppearance';

export function SuccessCheckmark({ size = 80 }: { size?: number }) {
  const isDark = useIsDark();
  const checkScale = useSharedValue(0);

  useEffect(() => {
    checkScale.value = withDelay(200, withSpring(1, { stiffness: 260, damping: 12 }));
  }, []);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: checkScale.value },
      { rotate: `${(1 - checkScale.value) * -15}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[checkStyle, { width: size, height: size, borderRadius: size / 2, backgroundColor: isDark ? colors.primary + '26' : colors.primary + '1A' }]}
      className="items-center justify-center mb-4"
    >
      <Ionicons name="checkmark" size={size * 0.45} color={colors.primary} />
    </Animated.View>
  );
}
