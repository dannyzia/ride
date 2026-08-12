import { useCallback, useEffect, useRef } from "react";
import { View, Text, StatusBar } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { colors } from "@/theme/goRide";
import { useAppearance } from "@/lib/useAppearance";

interface SplashAnimationProps {
  // True once auth + fonts have finished loading. The splash stays visible
  // until BOTH the entrance/exit animation has completed AND this is true,
  // so we never reveal a blank/uninitialized screen.
  loadComplete: boolean;
  onHidden: () => void;
}

export default function SplashAnimation({ loadComplete, onHidden }: SplashAnimationProps) {
  const { theme } = useAppearance();
  const isDark = theme === "dark" || theme === "system";

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const translateY = useSharedValue(20);

  // The animation worklet is created once (empty deps below), so it captures
  // `tryHide` from the first render. `tryHide` is stable (useCallback) and
  // reads the latest flags/callback through refs, so it behaves correctly
  // regardless of whether the animation finishes before or after the load.
  const animationDoneRef = useRef(false);
  const loadCompleteRef = useRef(loadComplete);
  const onHiddenRef = useRef(onHidden);

  const tryHide = useCallback(() => {
    if (animationDoneRef.current && loadCompleteRef.current) {
      onHiddenRef.current();
    }
  }, []);

  // Keep the load flag in sync. If auth/fonts resolve AFTER the animation
  // already completed, hide now.
  useEffect(() => {
    loadCompleteRef.current = loadComplete;
    tryHide();
  }, [loadComplete, tryHide]);

  useEffect(() => {
    opacity.value = withSequence(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) }),
      withDelay(
        1200,
        withTiming(0, { duration: 500, easing: Easing.in(Easing.ease) }, () => {
          animationDoneRef.current = true;
          runOnJS(tryHide)();
        })
      )
    );

    scale.value = withSequence(
      withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.5)) }),
      withDelay(1200, withTiming(0.9, { duration: 500 }))
    );

    translateY.value = withSequence(
      withTiming(0, { duration: 600, easing: Easing.out(Easing.ease) }),
      withDelay(1200, withTiming(-20, { duration: 500 }))
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  return (
    <View
      className="flex-1 justify-center items-center"
      style={{ backgroundColor: bg }}
    >
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={bg}
        translucent
      />

      <Animated.View style={animatedStyle} className="items-center">
        <Text
          className="text-[48px] font-JakartaBold"
          style={{ color: colors.primary }}
        >
          Ride
        </Text>
        <Text
          className="text-[16px] font-Jakarta mt-2"
          style={{ color: textPrimary }}
        >
          Your ride, your way
        </Text>
      </Animated.View>
    </View>
  );
}
