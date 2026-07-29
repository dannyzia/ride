import { useEffect } from 'react';
import { View, DimensionValue } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  className?: string;
}

export default function Skeleton({ width = "100%", height = 16, className = "" }: SkeletonProps) {
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
    <View className={`bg-goGray200 dark:bg-goBorderDark rounded-lg overflow-hidden ${className}`} style={{ width: width as DimensionValue, height }}>
      <Animated.View style={[shimmerStyle, { width: '100%', height }]} className="bg-goAccent/20" />
    </View>
  );
}
