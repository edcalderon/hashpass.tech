/**
 * Expo config plugin: enable Android release minification (R8/ProGuard) so
 * Gradle emits a mapping.txt file for Play Console deobfuscation uploads,
 * and enable resource shrinking alongside it.
 *
 * Both properties live here together because shrinkResources requires
 * minifyEnabled=true to do anything (see android/app/build.gradle's release
 * buildType: `shrinkResources (...)` reads
 * android.enableShrinkResourcesInReleaseBuilds, `minifyEnabled` reads
 * android.enableProguardInReleaseBuilds) -- Play Console's "R8 optimization"
 * technical-quality recommendation flags exactly this gap: code shrinking
 * was already on, but resource shrinking (removing unused
 * drawables/layouts/strings from the shipped bundle) was not, even though
 * turning it on is a single already-satisfied prerequisite away.
 */
const path = require('path');
let withGradleProperties;
try {
  ({ withGradleProperties } = require('@expo/config-plugins'));
} catch (_) {
  const expoRoot = path.dirname(require.resolve('expo/package.json'));
  ({ withGradleProperties } = require(
    require.resolve('@expo/config-plugins', { paths: [expoRoot] })
  ));
}

const PROGUARD_PROPERTY = 'android.enableProguardInReleaseBuilds';
const SHRINK_RESOURCES_PROPERTY = 'android.enableShrinkResourcesInReleaseBuilds';

function setGradleProperty(properties, key, value) {
  const next = { type: 'property', key, value };
  const index = properties.findIndex((entry) => entry.key === key);

  if (index >= 0) {
    properties[index] = next;
    return properties;
  }

  properties.push(next);
  return properties;
}

module.exports = function withAndroidReleaseMinification(config) {
  return withGradleProperties(config, (mod) => {
    const properties = mod.modResults;

    setGradleProperty(properties, PROGUARD_PROPERTY, 'true');
    setGradleProperty(properties, SHRINK_RESOURCES_PROPERTY, 'true');

    return mod;
  });
};
