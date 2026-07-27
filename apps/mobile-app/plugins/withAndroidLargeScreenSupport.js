/**
 * Expo config plugin: declare explicit large-screen/foldable support in the
 * generated AndroidManifest.xml.
 *
 * Play Console's "Remove resizability and orientation restrictions... to
 * support large screen devices" check looks for two things beyond the app
 * simply not locking orientation (MainActivity already ships
 * android:screenOrientation="unspecified", which is compliant on its own):
 *
 * 1. android:resizeableActivity="true" declared explicitly on <application>.
 *    It already defaults to true (targetSdkVersion >= 24), but Play's
 *    automated large-screen check flags the *absence* of the attribute, not
 *    just an explicit "false".
 * 2. MainActivity's android:configChanges missing `smallestScreenSize` and
 *    `density`. Without them, folding/unfolding a foldable or dragging the
 *    app between displays of different density tears down and recreates the
 *    activity instead of delivering onConfigurationChanged — see
 *    https://developer.android.com/guide/topics/large-screens/large-screen-cookbook#handle-configuration-changes.
 *    `orientation|screenSize|screenLayout` were already present; this adds
 *    the two large-screen-specific values without touching the rest.
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

const REQUIRED_CONFIG_CHANGES = ['smallestScreenSize', 'density'];

module.exports = function withAndroidLargeScreenSupport(config) {
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:resizeableActivity'] = 'true';

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(mod.modResults);
    const existing = (mainActivity.$['android:configChanges'] || '')
      .split('|')
      .map((value) => value.trim())
      .filter(Boolean);

    for (const value of REQUIRED_CONFIG_CHANGES) {
      if (!existing.includes(value)) {
        existing.push(value);
      }
    }

    mainActivity.$['android:configChanges'] = existing.join('|');
    return mod;
  });
};
