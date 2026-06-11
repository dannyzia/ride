import React, { useEffect } from 'react';
import {
  ImageBackground,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Props {
  /** Flip to true once auth initialisation resolves. Triggers the fade-out. */
  loadComplete: boolean;
  /** Called after the fade-out animation completes. Unmount the splash here. */
  onHidden: () => void;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export default function SplashAnimation({ loadComplete, onHidden }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();

  // ── Layout constants ─────────────────────────────────────
  // Derived from visual analysis of Splash_Screen_2.png.
  // The PNG contains a progress bar track at these positions.
  // The animated fill must sit exactly on top of that track.
  const BAR_WIDTH  = screenW * 0.62;                              // 62 % of screen width
  const BAR_HEIGHT = 10;                                           // px — matches image track height
  const BAR_TOP    = screenH * 0.882;                             // 88.2 % down the screen
  const BAR_LEFT   = screenW * 0.19;                              // 19 % from left (centres bar)
  const DOT_SIZE   = 14;                                           // leading glow dot diameter px
  const DOT_TOP    = BAR_TOP + BAR_HEIGHT / 2 - DOT_SIZE / 2;    // vertically centred on bar

  // ── Reanimated shared values ──────────────────────────────
  const fillWidth        = useSharedValue(0); // current fill width in px
  const containerOpacity = useSharedValue(1); // whole-screen opacity

  // ── On mount: start fill animation ───────────────────────
  useEffect(() => {
    fillWidth.value = withTiming(BAR_WIDTH, {
      duration: 3000,
      easing: Easing.out(Easing.cubic),
    });

    return () => {
      cancelAnimation(fillWidth);
      cancelAnimation(containerOpacity);
    };
  }, []);

  // ── When auth resolves: fade out the whole screen ────────
  useEffect(() => {
    if (!loadComplete) return;

    containerOpacity.value = withTiming(
      0,
      { duration: 600 },
      (finished) => {
        if (finished) {
          runOnJS(onHidden)();
        }
      },
    );
  }, [loadComplete]);

  // ── Animated styles ───────────────────────────────────────
  const containerAnimStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  // Clip container grows from 0 → BAR_WIDTH, revealing the gradient
  const fillAnimStyle = useAnimatedStyle(() => ({
    width: fillWidth.value,
  }));

  // Dot centre tracks the right edge of the fill
  const dotAnimStyle = useAnimatedStyle(() => ({
    left: BAR_LEFT + fillWidth.value - DOT_SIZE / 2,
  }));

  // ── Render ────────────────────────────────────────────────
  return (
    <Animated.View style={[styles.container, containerAnimStyle]}>

      {/* ── Background illustration ─────────────────────────
          The cityscape, car, logo, UI cards, and text are all
          baked into this PNG. Do not recreate them in code.   */}
      <ImageBackground
        source={require('@/assets/splash/Splash_Screen_2.png')}
        resizeMode="cover"
        style={styles.image}
      />

      {/* ── Progress bar ────────────────────────────────────
          Positioned on top of the track that is drawn in the
          PNG image at BAR_TOP / BAR_LEFT.                    */}
      <View
        style={[
          styles.barTrack,
          {
            top:    BAR_TOP,
            left:   BAR_LEFT,
            width:  BAR_WIDTH,
            height: BAR_HEIGHT,
          },
        ]}
      >
        {/* Track background — always full width, dark navy */}
        <View style={[StyleSheet.absoluteFillObject, styles.trackBg]} />

        {/* Animated fill — clips the gradient SVG as width grows */}
        <Animated.View style={[styles.barFill, fillAnimStyle]}>
          {/*
           * SVG is always BAR_WIDTH wide so the gradient always spans
           * its full intended range. The parent Animated.View clips it.
           * Gradient: #0CC25F (Ride green, left) → #00CFFF (cyan, right)
           */}
          <Svg width={BAR_WIDTH} height={BAR_HEIGHT}>
            <Defs>
              <LinearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#0CC25F" stopOpacity="1" />
                <Stop offset="1" stopColor="#00CFFF" stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={BAR_WIDTH}
              height={BAR_HEIGHT}
              rx={BAR_HEIGHT / 2}
              fill="url(#barGrad)"
            />
          </Svg>
        </Animated.View>
      </View>

      {/* ── Leading glow dot ────────────────────────────────
          Sibling of the barTrack View (not nested inside it)
          so it can use a screen-absolute `left` value driven
          by the same fillWidth shared value.                 */}
      <Animated.View
        style={[
          styles.dot,
          {
            top:          DOT_TOP,
            width:        DOT_SIZE,
            height:       DOT_SIZE,
            borderRadius: DOT_SIZE / 2,
          },
          dotAnimStyle,
        ]}
      />

    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    // flex:1 makes this fill whatever parent renders it.
    // _layout.tsx renders it as the sole child while splashVisible=true,
    // so it naturally takes the full screen.
    flex: 1,
  },
  image: {
    // Must fill its container completely.
    // resizeMode="cover" on the ImageBackground prop handles scaling.
    flex: 1,
    width: '100%',
    height: '100%',
  },
  barTrack: {
    // Absolute so it floats above the ImageBackground at exact coordinates.
    position: 'absolute',
  },
  trackBg: {
    // Matches the dark navy track drawn in the PNG image.
    borderRadius: 5,
    backgroundColor: '#0D1B2A',
  },
  barFill: {
    // overflow:hidden clips the full-width SVG to the animated width.
    // Without this the gradient would always be fully visible.
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  dot: {
    // Absolutely positioned — left is driven by dotAnimStyle.
    position: 'absolute',
    // Light cyan-white to suggest a glow at the leading edge of the fill.
    backgroundColor: '#AAEEFF',
    opacity: 0.9,
  },
});
