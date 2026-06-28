#!/usr/bin/env node
/* global __dirname, process */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  ROOT_DIR,
  MOBILE_APP_DIR,
  buildReleaseEnv,
  resolveSelectedProfile,
  loadEnvFile,
} = require('./mobile-release-env');

const ANDROID_SIGNING_ENV_PATH = path.join(ROOT_DIR, 'config', 'android-signing.env');
const { resolveAndroidVersionCode } = require(path.join(
  ROOT_DIR,
  'apps',
  'mobile-app',
  'lib',
  'android-version-code.js',
));

const FASTLANE_TRACKS = new Set(['internal', 'alpha', 'beta', 'production']);
const DEFAULT_FASTLANE_RELEASE_STATUS = 'completed';
const ANDROID_DIR = path.join(MOBILE_APP_DIR, 'android');

function normalizeFastlaneTrack(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (!FASTLANE_TRACKS.has(normalized)) {
    throw new Error(`Unsupported fastlane track: ${value}`);
  }

  return normalized;
}

function resolveFastlaneTrack({ profile, track } = {}) {
  const explicitTrack = normalizeFastlaneTrack(track);
  if (explicitTrack) {
    return explicitTrack;
  }

  return profile === 'production' ? 'production' : 'internal';
}

function buildFastlaneEnv({
  baseEnv = process.env,
  profile,
  track,
  releaseStatus = DEFAULT_FASTLANE_RELEASE_STATUS,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  const env = buildReleaseEnv({
    baseEnv,
    profile,
    rootEnvPath,
    mobileEnvPath,
    releaseBackend: 'fastlane',
  });
  const selectedProfile = resolveSelectedProfile({ profile, baseEnv: env });
  const androidVersionCode = resolveAndroidVersionCode({
    env,
    backend: 'fastlane',
  });

  env.MOBILE_RELEASE_BACKEND = 'fastlane';
  env.EXPO_USE_LOCAL_VERSIONING = '1';
  env.FASTLANE_TRACK = resolveFastlaneTrack({ profile: selectedProfile, track });
  env.FASTLANE_RELEASE_STATUS = releaseStatus || DEFAULT_FASTLANE_RELEASE_STATUS;
  env.MOBILE_ANDROID_VERSION_CODE = String(androidVersionCode);
  env.ANDROID_VERSION_CODE = String(androidVersionCode);
  env.CI = env.CI || '1';

  // Load local signing credentials from config/android-signing.env when not in CI.
  // Values from process.env and .env files take precedence over this file.
  if (!baseEnv.CI && fs.existsSync(ANDROID_SIGNING_ENV_PATH)) {
    const signingEnv = loadEnvFile(ANDROID_SIGNING_ENV_PATH);
    for (const [key, value] of Object.entries(signingEnv)) {
      if (!env[key]) {
        env[key] = value;
      }
    }
    // Resolve a relative ANDROID_KEYSTORE_PATH against the repo root.
    if (env.ANDROID_KEYSTORE_PATH && !path.isAbsolute(env.ANDROID_KEYSTORE_PATH)) {
      env.ANDROID_KEYSTORE_PATH = path.resolve(ROOT_DIR, env.ANDROID_KEYSTORE_PATH);
    }
  }

  return env;
}

function buildPromoteEnv({
  baseEnv = process.env,
  profile,
  track,
  promoteTo,
  releaseStatus = DEFAULT_FASTLANE_RELEASE_STATUS,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  const env = buildReleaseEnv({
    baseEnv,
    profile,
    rootEnvPath,
    mobileEnvPath,
    releaseBackend: 'fastlane',
  });
  const selectedProfile = resolveSelectedProfile({ profile, baseEnv: env });

  env.MOBILE_RELEASE_BACKEND = 'fastlane';
  env.FASTLANE_TRACK = resolveFastlaneTrack({ profile: selectedProfile, track });
  env.FASTLANE_TRACK_PROMOTE_TO = normalizeFastlaneTrack(promoteTo);
  env.FASTLANE_RELEASE_STATUS = releaseStatus || DEFAULT_FASTLANE_RELEASE_STATUS;
  env.CI = env.CI || '1';

  return env;
}

function runCommand(binary, args, { env, cwd = MOBILE_APP_DIR } = {}) {
  const result = spawnSync(binary, args, {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  if (result.status !== 0) {
    throw new Error(`Command failed: ${[binary, ...args].join(' ')}`);
  }
}

function runExpoPrebuild(env) {
  runCommand(
    'pnpm',
    ['--dir', MOBILE_APP_DIR, 'exec', 'expo', 'prebuild', '--platform', 'android', '--clean', '--non-interactive'],
    { env, cwd: ROOT_DIR },
  );
}

function runFastlaneLane(lane, env) {
  runCommand('bundle', ['exec', 'fastlane', 'android', lane], {
    env,
    cwd: MOBILE_APP_DIR,
  });
}

function cleanGeneratedAndroidDir(hadAndroidDir) {
  if (hadAndroidDir) {
    return;
  }

  fs.rmSync(ANDROID_DIR, { recursive: true, force: true });
}

function runFastlanePromote({
  baseEnv = process.env,
  profile,
  track,
  promoteTo,
  releaseStatus = DEFAULT_FASTLANE_RELEASE_STATUS,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  const env = buildPromoteEnv({
    baseEnv,
    profile,
    track,
    promoteTo,
    releaseStatus,
    rootEnvPath,
    mobileEnvPath,
  });

  runFastlaneLane('promote', env);
}

function runFastlane({
  baseEnv = process.env,
  profile,
  track,
  submit = true,
  releaseStatus = DEFAULT_FASTLANE_RELEASE_STATUS,
  // SKIP_EXPO_PREBUILD=1 is set by the workflow's "Conditional Expo prebuild" step
  // when android/ is cached and inputs haven't changed — lets Gradle run incrementally.
  prebuild = !process.env.SKIP_EXPO_PREBUILD,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  const env = buildFastlaneEnv({
    baseEnv,
    profile,
    track,
    releaseStatus,
    rootEnvPath,
    mobileEnvPath,
  });
  const hadAndroidDir = fs.existsSync(ANDROID_DIR);
  const lane = submit ? 'release' : 'build';

  try {
    if (prebuild) {
      runExpoPrebuild(env);
    }

    runFastlaneLane(lane, env);
  } finally {
    cleanGeneratedAndroidDir(hadAndroidDir);
  }
}

module.exports = {
  FASTLANE_TRACKS,
  DEFAULT_FASTLANE_RELEASE_STATUS,
  ANDROID_DIR,
  normalizeFastlaneTrack,
  resolveFastlaneTrack,
  buildFastlaneEnv,
  buildPromoteEnv,
  runCommand,
  runExpoPrebuild,
  runFastlaneLane,
  cleanGeneratedAndroidDir,
  runFastlanePromote,
  runFastlane,
};
