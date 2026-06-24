/**
 * Expo config plugin: enable Android release minification so Gradle emits a
 * mapping.txt file for Play Console deobfuscation uploads.
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

    return mod;
  });
};
