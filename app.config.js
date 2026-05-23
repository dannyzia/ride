import dotenv from "dotenv";

dotenv.config({ path: "./.env.local" });

const BARIKOI_API_KEY = process.env.BARIKOI_API_KEY || '';

export default {
  expo: {
    name: "Ride",
    slug: "ride-bd",
    platforms: ["ios", "android"],
    sdkVersion: "53.0.0",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/images/icon.png",
    userInterfaceStyle: "automatic",
    scheme: "myapp",
    splash: {
      image: "./assets/images/splash.png",
      resizeMode: "cover",
      backgroundColor: "#0C0B0B",
    },
    updates: {
      enabled: true,
      fallbackToCacheTimeout: 0,
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.ride.bd",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "We need your location to show it on the map",
      },
    },
    android: {
      package: "com.ride.bd",
      hermesEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/images/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
      ],
    },
    plugins: [
      "expo-secure-store",
      [
        "expo-notifications",
        {
          icon: "./assets/images/notification_icon.png",
          color: "#ffffff",
          defaultChannel: "default",
          sounds: [
            "./assets/notification_sound.wav",
            "./assets/notification_sound_other.wav",
          ],
          enableBackgroundRemoteNotifications: false,
        },
      ],
      [
        "expo-router",
        {
          origin: "https://ride.expo.app",
        },
      ],
      [
        "expo-image-picker",
        {
          photosPermission:
            "The app accesses your photos to let you share them with your friends.",
          cameraPermission:
            "The app accesses your camera to allow you to take photos.",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "43ad45d8-f2b4-456e-a48f-cfb48faeb6aa",
      },
      BARIKOI_API_KEY: process.env.BARIKOI_API_KEY,
      EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
      EXPO_PUBLIC_WEB_SOCKET_SERVER_URL:
        process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL,
      EXPO_PUBLIC_FIREBASE_API_KEY:
        process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
        process.env.FIREBASE_API_KEY,
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN:
        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID:
        process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID,
      EXPO_PUBLIC_FIREBASE_RTDB_URL: process.env.EXPO_PUBLIC_FIREBASE_RTDB_URL,
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET:
        process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        process.env.FIREBASE_STORAGE_BUCKET,
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
        process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
        process.env.FIREBASE_MESSAGING_SENDER_ID,
      EXPO_PUBLIC_FIREBASE_APP_ID:
        process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
      EXPO_PUBLIC_SUPPORT_PHONE: process.env.EXPO_PUBLIC_SUPPORT_PHONE,
    },
    web: {
      bundler: "metro",
      output: "server",
      favicon: "./assets/images/favicon.png",
    },
  },
};
