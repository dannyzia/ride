import { useEffect, ReactNode } from 'react';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

interface AnimatedCardProps {
  children: ReactNode;
  className?: string;
  index?: number;
}

export default function AnimatedCard({ children, className = "", index = 0 }: AnimatedCardProps) {
  const offset = useSharedValue(24 + index * 8);
  const opacity = useSharedValue(0);

  useEffect(() => {
    offset.value = withSpring(0, { stiffness: 120, damping: 14, mass: 0.8 });
    opacity.value = withSpring(1, { stiffness: 120, damping: 14 });
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={cardStyle} className={className}>
      {children}
    </Animated.View>
  );
}
