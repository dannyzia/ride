import { useEffect, useRef, useState } from "react";
import { View, Text } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/theme/goRide";
import { useIsDark } from "@/lib/useAppearance";

interface CountdownRingProps {
  expiresAt: string;
  /** Server-provided remaining lifetime in ms (M-D). When present, the ring
   *  counts down from it with local elapsed time, which is immune to device
   *  clock skew — a clock ahead by >15s used to expire every offer
   *  immediately. Falls back to expiresAt-vs-now when absent. */
  expiresInMs?: number;
  onExpire: () => void;
  size?: number;
  duration?: number;
}

export default function CountdownRing({ expiresAt, expiresInMs, onExpire, size = 56, duration = 15 }: CountdownRingProps) {
  const [remainingMs, setRemainingMs] = useState(0);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  const isDark = useIsDark();

  useEffect(() => {
    if (expiresInMs != null) {
      // M-D: seed from the server's expires_in_ms and measure elapsed locally
      // — skew-proof.
      const startedAt = Date.now();
      const update = () => {
        const diff = Math.max(0, expiresInMs - (Date.now() - startedAt));
        setRemainingMs(diff);
        if (diff <= 0) {
          onExpireRef.current();
        }
      };
      update();
      const interval = setInterval(update, 250);
      return () => clearInterval(interval);
    }

    // Legacy path — device clock vs server timestamp.
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
  }, [expiresAt, expiresInMs]);

  const seconds = Math.ceil(remainingMs / 1000);
  const isExpiring = seconds <= 5;
  const totalMs = expiresInMs != null ? expiresInMs : duration * 1000;
  const progress = Math.max(0, Math.min(1, remainingMs / totalMs));

  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const strokeColor = isExpiring ? colors.danger : colors.primary;
  const textColor = isExpiring ? colors.danger : (isDark ? colors.textPrimaryDark : colors.textPrimaryLight);
  const trackColor = isDark ? colors.borderDark : colors.borderLight;

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
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
          fontFamily: "Jakarta-Bold",
          fontSize: size > 48 ? 16 : 14,
          color: textColor,
        }}
      >
        {seconds}s
      </Text>
    </View>
  );
}
