const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Android 16 (API 36) compliance config plugin.
 *
 * Ensures targetSdkVersion and compileSdkVersion are 36 to satisfy Google Play's
 * August 31, 2026 enforcement policy for all new app submissions.
 */
module.exports = function withTargetSdk36(config) {
  return withAppBuildGradle(config, (modConfig) => {
    let contents = modConfig.modResults.contents;
    // Replace compileSdk
    contents = contents.replace(
      /compileSdk\s+(?:rootProject\.ext\.compileSdkVersion|\d+)/,
      "compileSdk 36"
    );
    // Replace targetSdkVersion
    contents = contents.replace(
      /targetSdkVersion\s+(?:rootProject\.ext\.targetSdkVersion|\d+)/,
      "targetSdkVersion 36"
    );
    modConfig.modResults.contents = contents;
    return modConfig;
  });
};
