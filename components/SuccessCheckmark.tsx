import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay } from 'react-native-reanimated';

export function SuccessCheckmark({ size = 80 }: { size?: number }) {
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
      style={[checkStyle, { width: size, height: size, borderRadius: size / 2 }]}
      className="bg-goAccent/10 dark:bg-goAccent/15 items-center justify-center mb-4"
    >
      <Text className="text-goAccent dark:text-goAccent" style={{ fontSize: size * 0.45 }}>✓</Text>
    </Animated.View>
  );
}
