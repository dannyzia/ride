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
 * Implementation note: the mutation is registered as the android FINALIZED
 * mod (runs after every other manifest-touching mod — early withAndroidManifest
 * child mods run against a manifest whose application element isn't fully
 * materialized and their attribute writes do not survive). DEBUG logs kept
 * until the orchestrator re-verifies on device, then removed.
 */
module.exports = function withLegacyBackDispatch(config) {
  console.log("[withLegacyBackDispatch] plugin function invoked");
  // Early attempt (kept as belt-and-braces for pipeline variants where it runs late).
  config = withAndroidManifest(config, (modConfig) => {
    const application =
      AndroidConfig.Manifest.getMainApplication(modConfig.modResults.manifest);
    if (application && application.$) {
      application.$["android:enableOnBackInvokedCallback"] = "false";
      console.log("[withLegacyBackDispatch] early mod set attribute");
    }
    return modConfig;
  });

  // Finalized slot — runs LAST in the android mod order (sortMods: finalized: 1).
  config.mods = config.mods ?? {};
  config.mods.android = config.mods.android ?? {};
  config.mods.android.finalized = async (modConfig) => {
    console.log(
      "[withLegacyBackDispatch] finalized modResults.manifest:",
      JSON.stringify(modConfig.modResults.manifest).slice(0, 800),
    );
    const application =
      AndroidConfig.Manifest.getMainApplication(modConfig.modResults.manifest);
    if (application && application.$) {
      application.$["android:enableOnBackInvokedCallback"] = "false";
      console.log("[withLegacyBackDispatch] finalized mod set attribute");
    } else {
      console.log(
        "[withLegacyBackDispatch] finalized mod: no application element",
      );
    }
    return modConfig;
  };
  return config;
};