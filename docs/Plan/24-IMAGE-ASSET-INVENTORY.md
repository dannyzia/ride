# 24-IMAGE-ASSET-INVENTORY.md

> Complete inventory of every image/icon asset in the app. Generated 2026-06-19 after cleanup of 39 unused files.

## Summary

- **Total assets remaining:** 29 images
- **Deleted:** 39 unused images (orphaned icons, old splash/icon variants, Expo template leftovers, unused onboarding images)
- **Cleanup commit:** Removed dead imports from `constants/data.ts` (22 imports) and `components/Map.tsx` (1 import)

---

## 1. Native Config Images (app.config.js)

These images are copied into `android/app/src/main/res/` during `expo prebuild`. They control the app icon, splash screen, and notification icon at the OS level.

| Config Key | File | Purpose |
|---|---|---|
| `expo.icon` | `assets/logo/logo.png` | App launcher icon (home screen) |
| `expo.splash.image` | `assets/splash/Splash_Screen_2.png` | Splash screen shown during cold start |
| `expo.android.adaptiveIcon.foregroundImage` | `assets/logo/logo.png` | Android adaptive icon foreground layer |
| `expo-notifications.icon` | `assets/images/notification_icon.png` | Push notification small icon |
| `expo.web.favicon` | `assets/images/favicon.png` | Web browser favicon (web platform only) |

---

## 2. Direct require() in Components

These images are loaded directly via `require()` in component source files.

| File:Line | Image | Purpose |
|---|---|---|
| `components/SplashAnimation.tsx:100` | `assets/splash/Splash_Screen_2.png` | Animated splash (Reanimated) |
| `app/(auth)/phone-entry.tsx:61` | `assets/logo/logo.png` | Logo on login screen |
| `components/Map.tsx:14` | `assets/icons/marker-goride-Marker Navigation.png` | User location marker on map |
| `components/Map.tsx:15` | `assets/icons/marker-goride-Marker Navigation-1.png` | Destination marker on map |

---

## 3. Via constants/data.ts — icons object

Exported from `constants/data.ts` as properties of the `icons` object. Consumed by components via `import { icons } from "@/constants/data"`.

| Property | File | Used By |
|---|---|---|
| `icons.cab` | `assets/icons/cab.png` | confirm-ride, book-ride, RiderRidesItem, Start, OnWay, Middle, LoadingRider, ErrorFindDriver, End |
| `icons.marker` | `assets/icons/marker.png` | confirm-ride, book-ride |
| `icons.pin` | `assets/icons/pin.png` | confirm-ride, book-ride |
| `icons.out` | `assets/icons/out.png` | home/index |
| `icons.search` | `assets/icons/search.png` | home/index, autocomplete, BarikoiAutocomplete |
| `icons.home` | `assets/icons/home.png` | (tabs)/_layout |
| `icons.list` | `assets/icons/list.png` | (tabs)/_layout |
| `icons.chat` | `assets/icons/chat.png` | (tabs)/_layout |
| `icons.profile` | `assets/icons/profile.png` | (tabs)/_layout |
| `icons.backArrow` | `assets/icons/back-arrow.png` | RideLayout, show-ride, autocomplete |
| `icons.dutyOn` | `assets/icons/switch_on.png` | RiderHeader |
| `icons.dutyOff` | `assets/icons/switch_off.png` | RiderHeader |
| `icons.close` | `assets/icons/close.png` | BarikoiAutocomplete, autocomplete |
| `icons.point` | `assets/icons/point.png` | RideCard |
| `icons.to` | `assets/icons/to.png` | RideCard |
| `icons.target` | `assets/icons/target.png` | find-ride |
| `icons.map` | `assets/icons/map.png` | find-ride |
| `icons.origin` | `assets/icons/origin.png` | finish-ride, find-customer, FinalDetails |
| `icons.destination` | `assets/icons/destination.png` | finish-ride, find-customer, FinalDetails |
| `icons.userNotFound` | `assets/icons/userNotFound.png` | ErrorFindDriver |

---

## 4. Via constants/data.ts — images object

Exported from `constants/data.ts` as properties of the `images` object. Consumed by components via `import { images } from "@/constants/data"`.

| Property | File | Used By |
|---|---|---|
| `images.noResult` | `assets/images/no-result.png` | rides/index, home/index |
| `images.message` | `assets/images/message.png` | chat/index |

---

## 5. Deleted Assets (39 files)

These files were removed because they were either orphaned (imported in `constants/data.ts` but never consumed by any component), old config remnants, or Expo template leftovers.

### Orphaned icons (imported in old data.ts, never consumed)

| Deleted File | Old Property |
|---|---|
| `assets/icons/arrow-down.png` | `icons.arrowDown` |
| `assets/icons/arrow-up.png` | `icons.arrowUp` |
| `assets/icons/check.png` | `icons.checkmark` |
| `assets/icons/dollar.png` | `icons.dollar` |
| `assets/icons/email.png` | `icons.email` |
| `assets/icons/eyecross.png` | `icons.eyecross` |
| `assets/icons/lock.png` | `icons.lock` |
| `assets/icons/person.png` | `icons.person` |
| `assets/icons/star.png` | `icons.star` |
| `assets/icons/selected-marker.png` | `icons.selectedMarker` |
| `assets/icons/destinationLocation.png` | `icons.destinationMarker` |
| `assets/icons/userLocation.png` | `icons.locationMarker` |

### Orphaned images (imported in old data.ts, never consumed)

| Deleted File | Old Property |
|---|---|
| `assets/images/check.png` | `images.check` |
| `assets/images/signup-car.png` | `images.signUpCar` |
| `assets/images/icon.png` | `images.icon` |
| `assets/images/customer.jpg` | `images.customer` |
| `assets/images/rider.jpg` | `images.rider` |
| `assets/images/onboarding1.png` | `images.onboarding1` |
| `assets/images/onboarding2.png` | `images.onboarding2` |
| `assets/images/onboarding3.png` | `images.onboarding3` |

### Never imported anywhere

| Deleted File | Reason |
|---|---|
| `assets/icons/google.png` | Unused UI element |
| `assets/icons/selected-marker1.png` | Unused |
| `assets/icons/selected-marker2.png` | Unused |
| `assets/icons/marker-goride-Marker Navigation-3.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-4.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-5.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-6.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-7.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-8.png` | Unused marker variant |
| `assets/icons/marker-goride-Marker Navigation-9.png` | Unused marker variant |
| `assets/icons/ride.jpg` | Unused |

### Old config remnants

| Deleted File | Reason |
|---|---|
| `assets/images/adaptive-icon.png` | Replaced by `logo.png` in app.config.js |
| `assets/images/splash.png` | Replaced by `Splash_Screen_2.png` in app.config.js |
| `assets/splash/screen2.png` | Duplicate/unused splash variant |
| `assets/splash/splash-brand.png` | Unused |

### Expo template leftovers

| Deleted File | Reason |
|---|---|
| `assets/images/partial-react-logo.png` | Expo default template |
| `assets/images/react-logo.png` | Expo default template |
| `assets/images/react-logo@2x.png` | Expo default template |
| `assets/images/react-logo@3x.png` | Expo default template |

---

## Maintenance Notes

- **Adding a new icon:** Place the file in `assets/icons/`, add an import + export in `constants/data.ts` under the `icons` object, then use `icons.yourIcon` in components.
- **Changing the app icon or splash:** Edit `app.config.js`, then run `npx expo prebuild --clean` to regenerate native resources.
- **The `onboarding` array and `rides`/`drivers` mock data** were removed from `constants/data.ts` during cleanup. If onboarding screens are needed, re-add the imports and array.
