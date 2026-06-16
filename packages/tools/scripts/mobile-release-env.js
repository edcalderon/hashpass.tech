const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const MOBILE_APP_DIR = path.join(ROOT_DIR, 'apps', 'mobile-app');
const ROOT_ENV_PATH = path.join(ROOT_DIR, '.env');
const MOBILE_ENV_PATH = path.join(MOBILE_APP_DIR, '.env');
const PRODUCTION_PROFILE = 'production';
const PRODUCTION_OWNER = 'hashpasss-team';
const DEVELOPMENT_OWNER = 'hashpasstechs-team';

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

function resolveGitCommit(projectRoot = ROOT_DIR) {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function buildReleaseEnv({
  rootEnvPath = ROOT_ENV_PATH,
  mobileEnvPath = MOBILE_ENV_PATH,
  baseEnv = process.env,
  easArgs = [],
  profile,
  releaseBackend = 'eas',
} = {}) {
  const env = {
    ...loadEnvFile(mobileEnvPath),
    ...loadEnvFile(rootEnvPath),
    ...baseEnv,
  };
  const selectedProfile = resolveSelectedProfile({ profile, easArgs, baseEnv: env });
  const projectId = resolveProjectId(env, selectedProfile);
  const expoToken = resolveExpoToken(env, selectedProfile);
  const gitCommit = resolveGitCommit(ROOT_DIR) || env.EXPO_PUBLIC_RELEASE_COMMIT || env.GIT_COMMIT || null;

  const resolvedEnv = {
    ...env,
    MOBILE_RELEASE_BACKEND: releaseBackend,
    EAS_BUILD_PROFILE: selectedProfile,
    EXPO_PUBLIC_EAS_BUILD_PROFILE: selectedProfile,
    ...(gitCommit
      ? {
          GIT_COMMIT: gitCommit,
          EXPO_PUBLIC_RELEASE_COMMIT: gitCommit,
        }
      : {}),
    ...(selectedProfile === PRODUCTION_PROFILE
      ? {
          EAS_PROJECT_ID: projectId || env.EAS_PROJECT_ID || env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EXPO_PUBLIC_EAS_PROJECT_ID: projectId || env.EAS_PROJECT_ID || env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EXPO_OWNER: env.EXPO_OWNER || PRODUCTION_OWNER,
        }
      : {
          EAS_PROJECT_ID: projectId || env.EAS_PROJECT_ID_DEV || env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV || env.EAS_PROJECT_ID || env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EXPO_PUBLIC_EAS_PROJECT_ID:
            projectId || env.EAS_PROJECT_ID_DEV || env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV || env.EAS_PROJECT_ID || env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EAS_PROJECT_ID_DEV:
            projectId || env.EAS_PROJECT_ID_DEV || env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV || env.EAS_PROJECT_ID || env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EXPO_PUBLIC_EAS_PROJECT_ID_DEV:
            projectId ||
            env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV ||
            env.EAS_PROJECT_ID_DEV ||
            env.EAS_PROJECT_ID ||
            env.EXPO_PUBLIC_EAS_PROJECT_ID,
          EXPO_OWNER_DEV: env.EXPO_OWNER_DEV || DEVELOPMENT_OWNER,
        }),
  };

  if (expoToken) {
    resolvedEnv.EXPO_TOKEN = expoToken;
  }

  return resolvedEnv;
}

module.exports = {
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
  resolveGitCommit,
  buildReleaseEnv,
};
