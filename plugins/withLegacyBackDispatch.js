const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

/**
 * ISSUE-112 (Android hardware back EXITS the app from pushed screens):
 *
 * targetSdk 36 (forced by withTargetSdk36.js for Play compliance) flips the
 * default of android:enableOnBackInvokedCallback to TRUE on Android 16
 * devices — predictive-back dispatch then SKIPS Activity.onBackPressed(),
 * which RN 0.79's ReactActivity (not a ComponentActivity, so the androidx
 * OnBackPressedDispatcher never bridges) relies on for hardware-back
 * routing. Result: no screen ever pops; the activity finishes to the
 * launcher from any pushed sub-screen.
 *
 * Pin the manifest attribute to FALSE explicitly so the legacy back
 * dispatch is restored deterministically on every Android version.
 * Config-level fix — no per-screen BackHandlers; RideSurfaceGuard and the
 * mount guards are JS-layer and unaffected.
 *
 * Implementation: the mutation runs as a withAndroidManifest CHILD mod
 * (the same mechanism expo-notifications meta-data and the MFS queries
 * use — child-mod mutations persist into the written manifest).
 * r2 fixes: (a) the android FINALIZED slot cannot write the manifest at
 * all (modResults.manifest is undefined there, after the file write) —
 * dropped; (b) getMainApplication expects the modResults WRAPPER
 * ({manifest: ...}), not the manifest node — passing the node short-
 * circuited the helper to null and every set was silently skipped.
 * The element's $ map may be null on the template; created on demand.
 */
module.exports = function withLegacyBackDispatch(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = AndroidConfig.Manifest.getMainApplication(
      modConfig.modResults,
    );
    if (application) {
      // $ can be null on the template element — create it before assigning.
      application.$ = application.$ ?? {};
      application.$["android:enableOnBackInvokedCallback"] = "false";
    }
    return modConfig;
  });
};
