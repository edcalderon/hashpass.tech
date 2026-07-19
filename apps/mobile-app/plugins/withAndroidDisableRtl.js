/**
 * Expo config plugin: set android:supportsRtl="false" on <application> in the
 * generated AndroidManifest.xml.
 *
 * This app only ships LTR locales (en/es/ko) and has no screens designed to
 * mirror. Android's I18nManager auto-detects RTL from the device's system
 * language before any JS runs, and calling I18nManager.allowRTL(false) /
 * forceRTL(false) from JS (see index.js) only persists the preference for the
 * NEXT app start — it does not retroactively fix the already-created
 * Yoga/native layout context for the CURRENT session, so a device that is
 * already RTL and just installed/updated the app would still see a mirrored
 * drawer for that entire first session. Setting android:supportsRtl="false"
 * in the manifest solves it at the native layer instead: Android never
 * mirrors this app's layout for RTL locales, from the very first frame,
 * regardless of install/update state or JS load timing.
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

module.exports = function withAndroidDisableRtl(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:supportsRtl'] = 'false';
    return mod;
  });
};
