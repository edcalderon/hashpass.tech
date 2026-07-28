/**
 * Expo config plugin: strip the AD_ID (advertising ID) permission that
 * @react-native-firebase/analytics bundles in transitively via Google Play
 * Services, regardless of whether the app actually reads the advertising ID.
 *
 * This app doesn't use the advertising ID for anything (no ads, no
 * cross-app/cross-device ad attribution) — Play Console's Data Safety /
 * App Content declaration says so. A release whose manifest still requests
 * com.google.android.gms.permission.AD_ID gets rejected at upload with
 * "This release includes the AD_ID permission but your declaration says
 * your app doesn't use advertising ID." Removing the permission via the
 * manifest merger (rather than flipping the Play Console declaration to
 * "yes, we use it") is the correct fix, since the declaration is accurate.
 */
const path = require('path');
let withAndroidManifest;
try {
  ({ withAndroidManifest } = require('@expo/config-plugins'));
} catch (_) {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  ({ withAndroidManifest } = require(
    require.resolve('@expo/config-plugins', { paths: [expoRoot] })
  ));
}

const AD_ID_PERMISSION = 'com.google.android.gms.permission.AD_ID';

module.exports = function withAndroidRemoveAdIdPermission(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    if (!Array.isArray(manifest['uses-permission'])) {
      manifest['uses-permission'] = [];
    }

    const alreadyDeclared = manifest['uses-permission'].some(
      (entry) => entry.$?.['android:name'] === AD_ID_PERMISSION
    );

    if (!alreadyDeclared) {
      manifest['uses-permission'].push({
        $: {
          'android:name': AD_ID_PERMISSION,
          'tools:node': 'remove',
        },
      });
    }

    // tools:node="remove" requires the tools namespace to be declared on
    // the root <manifest> element, or the merger ignores the attribute.
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return mod;
  });
};
