#!/usr/bin/env node
/* global __dirname, process */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const MOBILE_APP_DIR = path.join(ROOT_DIR, 'apps', 'mobile-app');
const ROOT_ENV_PATH = path.join(ROOT_DIR, '.env');
const MOBILE_ENV_PATH = path.join(MOBILE_APP_DIR, '.env');
const PRODUCTION_PROFILE = 'production';
const PRODUCTION_OWNER = 'hashpasstechs-team';

function normalizeProfile(profile) {
  const value = String(profile || '').trim().toLowerCase();

  return value || PRODUCTION_PROFILE;
}

function parseProfile(argv = []) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--profile' && argv[i + 1]) {
      return normalizeProfile(argv[i + 1]);
    }

    if (arg.startsWith('--profile=')) {
      return normalizeProfile(arg.split('=')[1]);
    }
  }

  return null;
}

function resolveSelectedProfile({ profile, easArgs = [], baseEnv = process.env } = {}) {
  return normalizeProfile(profile || parseProfile(easArgs) || baseEnv.EAS_BUILD_PROFILE);
}

function resolveProjectId(env, profile) {
  const isProduction = profile === PRODUCTION_PROFILE;
  const candidates = isProduction
    ? [env.EAS_PROJECT_ID, env.EXPO_PUBLIC_EAS_PROJECT_ID, env.EAS_PROJECT_ID_DEV, env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV]
    : [env.EAS_PROJECT_ID_DEV, env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV, env.EAS_PROJECT_ID, env.EXPO_PUBLIC_EAS_PROJECT_ID];

  return candidates.find(Boolean) || null;
}

function resolveExpoToken(env, profile) {
  const isProduction = profile === PRODUCTION_PROFILE;
  const candidates = isProduction ? [env.EXPO_TOKEN, env.EXPO_TOKEN_DEV] : [env.EXPO_TOKEN_DEV, env.EXPO_TOKEN];

  return candidates.find(Boolean) || null;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(filePath));
}

function buildEnv({
  rootEnvPath = ROOT_ENV_PATH,
  mobileEnvPath = MOBILE_ENV_PATH,
  baseEnv = process.env,
  easArgs = [],
  profile,
} = {}) {
  const env = {
    ...loadEnvFile(mobileEnvPath),
    ...loadEnvFile(rootEnvPath),
    ...baseEnv,
  };
  const selectedProfile = resolveSelectedProfile({ profile, easArgs, baseEnv: env });
  const projectId = resolveProjectId(env, selectedProfile);
  const expoToken = resolveExpoToken(env, selectedProfile);

  if (!projectId) {
    throw new Error(
      `EAS project id is missing for the ${selectedProfile} profile. Set EAS_PROJECT_ID${selectedProfile === PRODUCTION_PROFILE ? '' : '_DEV'} in the root .env file.`,
    );
  }

  if (!expoToken) {
    throw new Error(
      `EXPO_TOKEN is missing for the ${selectedProfile} profile. Set EXPO_TOKEN${selectedProfile === PRODUCTION_PROFILE ? '' : '_DEV'} in the root .env file or export it before running EAS.`,
    );
  }

  return {
    ...env,
    EAS_BUILD_PROFILE: selectedProfile,
    EXPO_PUBLIC_EAS_BUILD_PROFILE: selectedProfile,
    EAS_PROJECT_ID: projectId,
    EXPO_PUBLIC_EAS_PROJECT_ID: projectId,
    ...(selectedProfile === PRODUCTION_PROFILE
      ? {
          EXPO_OWNER: env.EXPO_OWNER || PRODUCTION_OWNER,
        }
      : {
          EAS_PROJECT_ID_DEV: projectId,
          EXPO_PUBLIC_EAS_PROJECT_ID_DEV: projectId,
          EXPO_OWNER: env.EXPO_OWNER || PRODUCTION_OWNER,
        }),
    EXPO_TOKEN: expoToken,
  };
}

function runEas(args, options = {}) {
  const env = options.env || buildEnv({ ...options, easArgs: args });

  if (!env.EXPO_TOKEN) {
    throw new Error(
      `EXPO_TOKEN is missing. Set it in ${path.relative(ROOT_DIR, options.rootEnvPath || ROOT_ENV_PATH)} or export it before running EAS.`,
    );
  }

  return spawnSync('eas', args, {
    cwd: options.cwd || MOBILE_APP_DIR,
    env,
    stdio: 'inherit',
  });
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 0) {
    console.error('Usage: node packages/tools/scripts/run-mobile-eas.js <eas args...>');
    process.exit(1);
  }

  let result;

  try {
    result = runEas(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  ROOT_DIR,
  MOBILE_APP_DIR,
  ROOT_ENV_PATH,
  MOBILE_ENV_PATH,
  normalizeProfile,
  parseProfile,
  resolveSelectedProfile,
  resolveProjectId,
  resolveExpoToken,
  loadEnvFile,
  buildEnv,
  runEas,
  main,
};
