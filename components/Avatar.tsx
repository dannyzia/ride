import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme/goRide";

interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  borderWidth?: number;
}

/**
 * §8.2 avatar. Remote image with an initials-circle fallback on missing/broken uri.
 */
const Avatar = ({ uri, name, size = 48, borderWidth = 0 }: AvatarProps) => {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const radius = size / 2;
  const frameStyle = {
    width: size,
    height: size,
    borderRadius: radius,
    borderWidth,
    borderColor: colors.primary,
  };

  const initial = (name?.trim().charAt(0) ?? "").toUpperCase();

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={[frameStyle, styles.image]}
        accessibilityRole="image"
        accessibilityLabel={name ? `${name} avatar` : "Avatar"}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <View style={[frameStyle, styles.fallback]} accessibilityRole="text" accessibilityLabel={name ? `${name} avatar` : "Avatar"}>
      <Text style={[styles.initial, { fontSize: size * 0.4 }]}>{initial || "?"}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    resizeMode: "cover",
  },
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  initial: {
    fontFamily: "Jakarta-SemiBold",
    color: colors.white,
  },
});

export default Avatar;
