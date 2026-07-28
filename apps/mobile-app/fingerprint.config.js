// Config for @expo/fingerprint, auto-loaded by expo-updates' "fingerprint"
// runtimeVersion policy (see app.json) at both prebuild-embed time and
// `eas update` publish time.
//
// ExpoConfigVersions skips expo.version and expo.android.versionCode when
// computing the fingerprint. Without this, the fingerprint changes on every
// single release -- packages/tools/scripts/update-version.mjs bumps both of
// those fields on every release regardless of whether anything native
// actually changed, which would silently break OTA update matching the same
// way runtimeVersion: { policy: "appVersion" } did (see
// apps/docs/docs/reference/mobile-app/eas-update-ota.md). Verified locally:
// bumping only version/versionCode leaves the fingerprint hash identical;
// a genuine native change (e.g. adding an Android permission) still changes it.
module.exports = {
  sourceSkips: ['ExpoConfigVersions'],
};
