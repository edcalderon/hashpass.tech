/** Google Play submissions require Android 16 (API 36) from August 2026.
 * Apply through prebuild so EAS and Fastlane generate the same Android target. */
const path = require('path');
const expoRoot = path.dirname(require.resolve('expo/package.json'));
const { withGradleProperties } = require(require.resolve('@expo/config-plugins', { paths: [expoRoot] }));

module.exports = function withAndroidTargetSdk(config) {
  return withGradleProperties(config, mod => {
    const keys = ['android.compileSdkVersion', 'android.targetSdkVersion'];
    mod.modResults = mod.modResults.filter(entry => !keys.includes(entry.key));
    for (const key of keys) mod.modResults.push({ type: 'property', key, value: '36' });
    return mod;
  });
};
