import { useEffect } from 'react';
import { View, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { colors } from '@/theme/goRide';
import { useIsDark } from '@/lib/useAppearance';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  className?: string;
}

export default function Skeleton({ width = "100%", height = 16, className = "" }: SkeletonProps) {
  const isDark = useIsDark();
  const shimmer = useSharedValue(-200);

  useEffect(() => {
    shimmer.value = withRepeat(
      withSequence(
        withTiming(400, { duration: 1200, easing: Easing.linear }),
        withTiming(-200, { duration: 0 }),
      ),
      -1,
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shimmer.value }] }));

  return (
    <View className={`rounded-lg overflow-hidden ${className}`} style={{ width: width as DimensionValue, height, backgroundColor: isDark ? colors.borderDark : colors.gray200 }}>
      <Animated.View style={[shimmerStyle, { width: '100%', height }]} className="bg-goPrimary/20" />
    </View>
  );
}
