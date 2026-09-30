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
} = require('./mobile-release-env');

const IOS_DIR = path.join(MOBILE_APP_DIR, 'ios');

function resolveIosBuildNumber({ baseEnv = process.env } = {}) {
  const value = String(baseEnv.IOS_BUILD_NUMBER || baseEnv.GITHUB_RUN_NUMBER || '').trim();

  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error('Set IOS_BUILD_NUMBER or GITHUB_RUN_NUMBER to a positive integer before building iOS.');
  }

  return value;
}

function buildIosFastlaneEnv({ baseEnv = process.env, profile, submit = true, rootEnvPath, mobileEnvPath } = {}) {
  const env = buildReleaseEnv({
    baseEnv,
    profile,
    rootEnvPath,
    mobileEnvPath,
    releaseBackend: 'fastlane',
  });
  const selectedProfile = resolveSelectedProfile({ profile, baseEnv: env });

  env.MOBILE_RELEASE_BACKEND = 'fastlane';
  env.EXPO_USE_LOCAL_VERSIONING = '1';
  env.EAS_BUILD_PROFILE = selectedProfile;
  env.FASTLANE_PLATFORM = 'ios';
  env.FASTLANE_IOS_LANE = submit ? 'testflight' : 'build';
  env.IOS_BUILD_NUMBER = resolveIosBuildNumber({ baseEnv: env });
  env.CI = env.CI || '1';

  return env;
}

function runCommand(binary, args, { env, cwd = MOBILE_APP_DIR } = {}) {
  const result = spawnSync(binary, args, { cwd, env, stdio: 'inherit' });

  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  if (result.status !== 0) throw new Error(`Command failed: ${[binary, ...args].join(' ')}`);
}

function runExpoPrebuild(env) {
  runCommand(
    'pnpm',
    ['--dir', MOBILE_APP_DIR, 'exec', 'expo', 'prebuild', '--platform', 'ios', '--clean', '--non-interactive'],
    { env, cwd: ROOT_DIR },
  );
}

function runFastlaneLane(lane, env) {
  runCommand('bundle', ['exec', 'fastlane', 'ios', lane], { env, cwd: MOBILE_APP_DIR });
}

function cleanGeneratedIosDir(hadIosDir) {
  if (!hadIosDir) fs.rmSync(IOS_DIR, { recursive: true, force: true });
}

function runIosFastlane({
  baseEnv = process.env,
  profile,
  submit = true,
  prebuild = !process.env.SKIP_EXPO_PREBUILD,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  if (process.platform !== 'darwin') {
    throw new Error('iOS Fastlane releases must run on macOS.');
  }

  const env = buildIosFastlaneEnv({ baseEnv, profile, submit, rootEnvPath, mobileEnvPath });
  const hadIosDir = fs.existsSync(IOS_DIR);

  try {
    if (prebuild) runExpoPrebuild(env);
    runFastlaneLane(env.FASTLANE_IOS_LANE, env);
  } finally {
    cleanGeneratedIosDir(hadIosDir);
  }
}

module.exports = {
  IOS_DIR,
  resolveIosBuildNumber,
  buildIosFastlaneEnv,
  runCommand,
  runExpoPrebuild,
  runFastlaneLane,
  cleanGeneratedIosDir,
  runIosFastlane,
};
