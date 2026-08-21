// Expo SDK 53 loads .env/.env.local natively — no dotenv import needed.
// On Render, env vars are set via the dashboard.

export default {
  expo: {
    name: "Ride",
    slug: "ride-bd",
    platforms: ["ios", "android"],
    sdkVersion: "53.0.0",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/logo/logo.png",
    userInterfaceStyle: "automatic",
    // W-4: real deep-link scheme (was the "myapp" tutorial placeholder, which
    // collides with any other default-configured Expo app). Used by the
    // /payment/success|failure web screens to return users into the app.
    scheme: "ride",
    splash: {
      image: "./assets/splash/Splash_Screen_2.png",
      resizeMode: "contain",
      backgroundColor: "#181A20",
    },
    updates: {
      enabled: true,
      // EAS Update project URL — required for OTA delivery. Without it the
      // client never checks for updates and `eas update` pushes are inert.
      url: "https://u.expo.dev/3293078f-d655-46b9-8a03-c45b2fab2c2d",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
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
        foregroundImage: "./assets/logo/logo.png",
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
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow Ride to access your location while driving.",
        },
      ],
      "@maplibre/maplibre-react-native",
    ],
    extra: {
      eas: {
        projectId: "3293078f-d655-46b9-8a03-c45b2fab2c2d",
      },
      EXPO_PUBLIC_BARIKOI_API_KEY: process.env.BARIKOI_API_KEY,
      EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
      EXPO_PUBLIC_WEB_SOCKET_SERVER_URL:
        process.env.EXPO_PUBLIC_WEB_SOCKET_SERVER_URL,
      EXPO_PUBLIC_SUPABASE_URL:
        process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_SUPPORT_PHONE: process.env.EXPO_PUBLIC_SUPPORT_PHONE,
    },
    web: {
      bundler: "metro",
      // Dev-only override: web.output "server" (SSR) crashes on Node >= 22
      // with "Object prototype may only be an Object or null". Production
      // (Render) keeps the default "server" output; set EXPO_WEB_OUTPUT=single
      // locally (see .freebuff/run.md) to preview in the browser.
      output: process.env.EXPO_WEB_OUTPUT === "single" ? "single" : "server",
      favicon: "./assets/images/favicon.png",
    },
  },
};
