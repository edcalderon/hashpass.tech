#!/usr/bin/env node
/* global __dirname, process */

const { spawnSync } = require('child_process');
const path = require('path');
const {
  ROOT_DIR,
  MOBILE_APP_DIR,
  ROOT_ENV_PATH,
  MOBILE_ENV_PATH,
  PRODUCTION_PROFILE,
  PRODUCTION_OWNER,
  DEVELOPMENT_OWNER,
  normalizeProfile,
  parseProfile,
  resolveSelectedProfile,
  resolveProjectId,
  resolveExpoToken,
  loadEnvFile,
  buildReleaseEnv,
} = require('./mobile-release-env');

function buildEnv({
  rootEnvPath = ROOT_ENV_PATH,
  mobileEnvPath = MOBILE_ENV_PATH,
  baseEnv = process.env,
  easArgs = [],
  profile,
} = {}) {
  const env = buildReleaseEnv({
    rootEnvPath,
    mobileEnvPath,
    baseEnv,
    easArgs,
    profile,
    releaseBackend: 'eas',
  });
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
          EXPO_OWNER_DEV: env.EXPO_OWNER_DEV || DEVELOPMENT_OWNER,
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
