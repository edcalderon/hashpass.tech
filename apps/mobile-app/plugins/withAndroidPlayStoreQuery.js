/**
 * Expo config plugin: declare package visibility for the Play Store app and
 * the market:// scheme in the generated AndroidManifest.xml.
 *
 * SoftUpdateBanner / VersionQuickSheet try Linking.openURL('market://details?
 * id=com.hashpass.tech') first so tapping "Update" opens the native Play
 * Store app, falling back to the https Play Store URL only if that fails.
 * On Android 11+ (API 30+), package visibility restrictions mean
 * Linking.canOpenURL('market://...') returns false unless the app declares
 * it can see com.android.vending / the market scheme in <queries> -- without
 * this, the market:// attempt always silently fails and every tap falls
 * back to the browser, even with the Play Store app installed.
 */
const path = require('path');
let withAndroidManifest, AndroidConfig;
try {
  ({ withAndroidManifest, AndroidConfig } = require('@expo/config-plugins'));
} catch (_) {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  ({ withAndroidManifest, AndroidConfig } = require(
    require.resolve('@expo/config-plugins', { paths: [expoRoot] })
  ));
}

module.exports = function withAndroidPlayStoreQuery(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!Array.isArray(manifest.queries)) {
      manifest.queries = [];
    }

    const alreadyDeclared = manifest.queries.some((query) =>
      (query.package || []).some((pkg) => pkg.$?.['android:name'] === 'com.android.vending')
    );

    if (!alreadyDeclared) {
      manifest.queries.push({
        package: [{ $: { 'android:name': 'com.android.vending' } }],
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'market' } }],
          },
        ],
      });
    }

    return mod;
  });
};
