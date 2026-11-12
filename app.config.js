// Expo SDK 53 loads .env/.env.local natively — no dotenv import needed.
// On Render, env vars are set via the dashboard.

export default {
  expo: {
    name: "Node",
    slug: "node-bd",
    platforms: ["ios", "android"],
    sdkVersion: "53.0.0",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/logo/node_icon_1024.png",
    userInterfaceStyle: "automatic",
    // W-4: real deep-link scheme (was the "myapp" tutorial placeholder, which
    // collides with any other default-configured Expo app). Used by the
    // /payment/success|failure web screens to return users into the app.
    scheme: "node",
    splash: {
      image: "./assets/splash/node_splash.png",
      resizeMode: "contain",
      backgroundColor: "#102A66",
    },
    updates: {
      // 2026-08-31: temporarily disabled — the on-device dev client (com.ride.bd)
      // was built before expo-updates was bumped to a version that eagerly
      // calls requireNativeModule('ExpoUpdates') at JS eval time, so the
      // native module is missing in the installed binary and the bundle
      // throws "Cannot find native module 'ExpoUpdates'" on first load.
      // Dev-only unblock: disable updates so the JS never imports it. The
      // production path (EAS / Render) uses a freshly-built client that
      // includes the native module, so this can be flipped back to true
      // (or gated per-profile) when the native dev client is rebuilt.
      enabled: false,
      url: "https://u.expo.dev/3293078f-d655-46b9-8a03-c45b2fab2c2d",
      fallbackToCacheTimeout: 0,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    assetBundlePatterns: [
      "assets/images/*",
      "assets/fonts/*",
      "assets/icons/*",
      "assets/splash/*",
      "assets/logo/*",
      "assets/map-styles/*",
      "assets/notification_sound.wav",
      "assets/notification_sound_other.wav",
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.node.bd",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "We need your location to show it on the map",
        // Plan 29 (F3): iOS LSApplicationQueriesSchemes for canOpenURL support
        LSApplicationQueriesSchemes: ["bkash", "nagad"],
      },
    },
    android: {
      package: "com.node.bd",
      hermesEnabled: true,
      adaptiveIcon: {
        foregroundImage: "./assets/images/node_adaptive_foreground.png",
        backgroundColor: "#F8FBFF",
      },
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
      ],
    },
    plugins: [
      "./plugins/withMfsPackageQueries.js",
      "./plugins/withTargetSdk36.js",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          icon: "./assets/images/node_notification_icon.png",
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
          origin: "https://node.expo.app",
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
          // Play-policy framing: delivery / ambulance / order tracking — no
          // ride-hailing or driving wording (Node launch, D-2 scope).
          locationAlwaysAndWhenInUsePermission:
            "Allow Node to access your location for deliveries, ambulance pickup, and live order tracking.",
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
