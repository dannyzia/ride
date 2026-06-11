Splash Screen — Build Instructions
What exists
File	Purpose
assets/animations/splash.riv	Rive animation (4 KB) — neon trails, logo pulse, progress bar, particles
components/SplashAnimation.tsx	RN component — loads .riv via expo-asset, overlays "RIDE" + tagline as RN Text
app/_layout.tsx	Shows <SplashAnimation /> while initializing === true, then swaps to <Slot />
metro.config.js	Registers .riv as a Metro asset extension
Rive animation details
- Artboard: SplashScreen — 1080×2400
- Animation: SplashLoop — 300 frames @ 60fps, infinite loop
- State machine: SplashSM with LoadComplete trigger (for future use)
- Groups: BackgroundGroup → LogoGroup → ForegroundGroup → UIGroup
- Safe zones: Logo at y=35%, progress bar at y=84% — safe on all screens from 720×1280 to 1179×2556 with Fit.Cover
Prerequisites (do these first)
cd "D:\My Projects\Current Project\Ride"
npm install
Step 1: Link native modules
rive-react-native is a native module. You MUST run a native build before the splash will work on device:
# Android
npx expo run:android
# iOS (macOS only)
npx expo run:ios
This links the native .aar / .framework and creates the android/ios native directories. After this first build, incremental JS-only changes work with npx expo start.
Step 2: Verify Metro bundling
The .riv file is registered as a Metro asset in metro.config.js:
config.resolver.assetExts = [...(config.resolver.assetExts ?? []), "riv"];
If you get "Unable to resolve" errors at runtime, verify this line is present.
Step 3: Test the splash
1. npx expo start → press a for Android or i for iOS
2. The splash shows while Supabase auth state resolves (the initializing state in _layout.tsx)
3. Once auth check completes, initializing flips to false and <Slot /> renders
Step 4: Test responsive behavior
To verify the splash looks good on different screen sizes:
Option A — Change fit mode temporarily:
// In SplashAnimation.tsx, change:
fit={Fit.Cover}
// to:
fit={Fit.Contain}
This shows the full artboard with letterboxing — you'll see if any elements are too close to edges.
Option B — Test on different emulators:
- Pixel 4a: 1080×2340 (20:9)
- Pixel 3: 1080×2160 (18:9)
- Small phone: 720×1280 (9:16)
Option C — In Rive editor:
Open assets/animations/splash.riv in the Rive desktop app, resize the artboard to different dimensions and preview.
Common issues
Problem	Fix
Blank screen / no animation	Run npx expo run:android to link native module
"Unable to resolve splash.riv"	Verify metro.config.js has "riv" in assetExts
Text "RIDE" not visible	The RN overlay text is always visible even if .riv fails to load — this is intentional
Animation stutters on old devices	The .riv is 4 KB with 62 keyframes — should be fine. If not, reduce trail count from 6 to 3
Progress bar at wrong position	The progress bar is inside the Rive artboard at y=2020. If it looks off, adjust in SplashAnimation.tsx overlay padding
Production build
# EAS build
eas build --platform android --profile production
eas build --platform ios --profile production
No special EAS config needed — rive-react-native auto-links via react-native.config.js.
Files NOT to touch
- assets/splash/screen2.png — this is the static fallback splash (used by expo-splash-screen native config in app.config.js). Keep it as-is.
- app.config.js splash config — the native splash screen shows FIRST (before JS loads), then the Rive animation takes over once the JS bundle initializes.
