const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { buildExpoConfig } = require('./lib/eas-config');

const baseConfig = require('./app.json').expo;

// The @sentry/react-native/expo plugin (which injects a `sentry.gradle` apply
// into android/app/build.gradle for build-time source-map/debug-symbol
// upload) was TEMPORARILY REMOVED from app.json's plugins list — it broke the
// v1.8.201 release build with "Could not evaluate spec for 'Task satisfies
// onlyIf closure'" in the SentryUpload task, most likely a Gradle
// configuration-cache incompatibility (the build's "external process
// started" configuration-cache warnings specifically flagged
// sentry.gradle:303), compounded by SENTRY_AUTH_TOKEN not yet being
// configured as a real GitHub secret. The @sentry/react-native JS package —
// and its native Android module, which autolinks independently of this Expo
// config plugin (it has its own android/ dir + codegenConfig) — stays
// installed, and Sentry.init() still runs in app/_layout.tsx, so crash
// reporting keeps working; only the CI-time source-map upload step is
// disabled until this is re-added with a real auth token and verified in
// isolation, away from an active release.

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  dotenv.config({
    path: filePath,
    override: false,
    quiet: true,
  });
}

// Load the repo-level env first so local and EAS builds can share one source of truth.
loadEnvFile(path.resolve(__dirname, '../../.env'));
loadEnvFile(path.resolve(__dirname, '.env'));

module.exports = ({ config } = {}) => {
  const mergedBase = config || baseConfig;

  return buildExpoConfig({ baseConfig: mergedBase, env: process.env });
};
