const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Plan 29 (F3): Android 11+ (API 30+) package visibility queries for MFS deep-links (bKash & Nagad).
 */
module.exports = function withMfsPackageQueries(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;
    if (!manifest.queries) {
      manifest.queries = [];
    }
    manifest.queries.push(
      {
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "bkash" } }],
          },
        ],
      },
      {
        intent: [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
            data: [{ $: { "android:scheme": "nagad" } }],
          },
        ],
      },
      {
        package: [{ $: { "android:name": "com.bKash.customerapp" } }],
      },
      {
        package: [{ $: { "android:name": "com.konasl.nagad" } }],
      }
    );
    return modConfig;
  });
};

