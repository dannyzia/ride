import { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '@/theme/goRide';

interface CountdownRingProps {
  expiresAt: string;
  onExpire: () => void;
  size?: number;
  duration?: number; // total duration in seconds (default 15)
}

export default function CountdownRing({ expiresAt, onExpire, size = 56, duration = 15 }: CountdownRingProps) {
  const [remainingMs, setRemainingMs] = useState(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const target = new Date(expiresAt).getTime();
      const diff = Math.max(0, target - now);
      setRemainingMs(diff);

      if (diff <= 0) {
        onExpireRef.current();
      }
    };

    update();
    const interval = setInterval(update, 250);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const seconds = Math.ceil(remainingMs / 1000);
  const isExpiring = seconds <= 5;
  const progress = Math.max(0, Math.min(1, remainingMs / (duration * 1000)));

  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const strokeColor = isExpiring ? colors.danger : colors.primary;
  const textColor = isExpiring ? colors.danger : colors.textPrimaryDark;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.borderDark}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
      <Text
        style={{
          fontFamily: 'Urbanist',
          fontWeight: '700',
          fontSize: size > 48 ? 16 : 14,
          color: textColor,
        }}
      >
        {seconds}s
      </Text>
    </View>
  );
}
