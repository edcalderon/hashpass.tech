#!/usr/bin/env node
/* global process */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  ROOT_DIR,
  MOBILE_APP_DIR,
  ROOT_ENV_PATH,
  MOBILE_ENV_PATH,
  loadEnvFile,
} = require('./mobile-release-env');
const {
  ANDROID_DIR,
  buildFastlaneEnv,
  cleanGeneratedAndroidDir,
  runExpoPrebuild,
  runFastlane,
} = require('./run-mobile-fastlane');
const {
  normalizeReleaseEnvironment,
  resolveReleaseProfile,
} = require('./run-mobile-release');

const DEFAULT_RELEASE_ENV = 'development';
const DEFAULT_TRACK = 'internal';
const DEFAULT_SITE_URL = 'https://hashpass.tech';
const AAB_PATH = path.join(
  MOBILE_APP_DIR,
  'android',
  'app',
  'build',
  'outputs',
  'bundle',
  'release',
  'app-release.aab',
);

const WORKFLOW_MOBILE_ENV_KEYS = [
  'EXPO_PUBLIC_SUPABASE_PROFILE',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_DIRECTUS_URL',
  'EXPO_PUBLIC_SITE_URL',
  'EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_SENTRY_DSN',
];

const AUTH_CRITICAL_ENV_KEYS = [
  'EXPO_PUBLIC_SUPABASE_PROFILE',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_SITE_URL',
  'EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
];

const SIGNING_ENV_KEYS = [
  'ANDROID_KEYSTORE_PATH',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
];

const LOCAL_SIGNING_ENV_PATH = path.join(ROOT_DIR, 'config', 'android-signing.env');

function firstEnvValue(sourceEnv, names) {
  for (const name of names) {
    const value = sourceEnv[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}

function parseParityArgs(argv = []) {
  const options = {
    releaseEnv: DEFAULT_RELEASE_ENV,
    track: DEFAULT_TRACK,
    submit: false,
    install: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--env' && argv[i + 1]) {
      options.releaseEnv = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.releaseEnv = arg.split('=')[1];
      continue;
    }

    if (arg === '--track' && argv[i + 1]) {
      options.track = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--track=')) {
      options.track = arg.split('=')[1];
      continue;
    }

    if (arg === '--submit') {
      options.submit = true;
      continue;
    }

    if (arg === '--no-submit') {
      options.submit = false;
      continue;
    }

    if (arg === '--install') {
      options.install = true;
    }
  }

  options.releaseEnv = normalizeReleaseEnvironment(options.releaseEnv);
  options.track = String(options.track || DEFAULT_TRACK).trim().toLowerCase();

  return options;
}

function loadSourceEnv({
  baseEnv = process.env,
  rootEnvPath = ROOT_ENV_PATH,
  rootLocalEnvPath = path.join(ROOT_DIR, '.env.local'),
  mobileEnvPath = MOBILE_ENV_PATH,
  mobileProductionEnvPath = path.join(MOBILE_APP_DIR, '.env.production'),
} = {}) {
  return {
    ...loadEnvFile(rootEnvPath),
    ...loadEnvFile(rootLocalEnvPath),
    ...loadEnvFile(mobileEnvPath),
    ...loadEnvFile(mobileProductionEnvPath),
    ...baseEnv,
  };
}

function resolveWorkflowMobileEnv({ sourceEnv = {}, releaseEnv = DEFAULT_RELEASE_ENV } = {}) {
  const normalizedEnv = normalizeReleaseEnvironment(releaseEnv);
  const isDevelopment = normalizedEnv === 'development';
  const env = {
    ['EXPO_PUBLIC_SUPABASE_PROFILE']: isDevelopment ? 'core-development' : 'core-production',
    ['EXPO_PUBLIC_SUPABASE_URL']: firstEnvValue(
      sourceEnv,
      isDevelopment
        ? ['EXPO_PUBLIC_SUPABASE_URL_DEV', 'EXPO_PUBLIC_SUPABASE_URL']
        : ['EXPO_PUBLIC_SUPABASE_URL_PROD', 'EXPO_PUBLIC_SUPABASE_URL'],
    ),
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY']: firstEnvValue(
      sourceEnv,
      isDevelopment
        ? [
            'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV',
            'EXPO_PUBLIC_SUPABASE_KEY_DEV',
            'EXPO_PUBLIC_SUPABASE_ANON_KEY',
            'EXPO_PUBLIC_SUPABASE_KEY',
          ]
        : [
            'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
            'EXPO_PUBLIC_SUPABASE_KEY_PROD',
            'EXPO_PUBLIC_SUPABASE_ANON_KEY',
            'EXPO_PUBLIC_SUPABASE_KEY',
          ],
    ),
    ['EXPO_PUBLIC_DIRECTUS_URL']: firstEnvValue(sourceEnv, ['EXPO_PUBLIC_DIRECTUS_URL']),
    ['EXPO_PUBLIC_SITE_URL']: firstEnvValue(sourceEnv, ['EXPO_PUBLIC_SITE_URL', 'PUBLIC_URL']) || DEFAULT_SITE_URL,
    ['EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN']:
      firstEnvValue(sourceEnv, ['EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN']) || 'true',
    ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID']: firstEnvValue(sourceEnv, ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID']),
    ['EXPO_PUBLIC_SENTRY_DSN']: firstEnvValue(sourceEnv, ['EXPO_PUBLIC_SENTRY_DSN']),
  };

  return Object.fromEntries(
    WORKFLOW_MOBILE_ENV_KEYS
      .map((key) => [key, env[key]])
      .filter(([, value]) => typeof value === 'string' && value.length > 0),
  );
}

function createParityEnvFiles({ sourceEnv = {}, releaseEnv = DEFAULT_RELEASE_ENV } = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-play-parity-'));
  const rootEnvPath = path.join(tempDir, '.env-root');
  const mobileEnvPath = path.join(tempDir, '.env-mobile');
  const mobileEnv = resolveWorkflowMobileEnv({ sourceEnv, releaseEnv });
  const lines = WORKFLOW_MOBILE_ENV_KEYS
    .filter((key) => mobileEnv[key])
    .map((key) => `${key}=${mobileEnv[key]}`);

  fs.writeFileSync(rootEnvPath, '', 'utf8');
  fs.writeFileSync(mobileEnvPath, `${lines.join('\n')}${lines.length ? '\n' : ''}`, 'utf8');

  return {
    tempDir,
    rootEnvPath,
    mobileEnvPath,
    mobileEnv,
  };
}

function missingAuthCriticalKeys(mobileEnv) {
  return AUTH_CRITICAL_ENV_KEYS.filter((key) => !mobileEnv[key]);
}

function hasSigningEnv(sourceEnv) {
  if (fs.existsSync(LOCAL_SIGNING_ENV_PATH)) {
    return true;
  }

  return SIGNING_ENV_KEYS.every((key) => {
    const value = sourceEnv[key] || sourceEnv[key.replace('ANDROID_', 'ANDROID_RELEASE_')];
    return typeof value === 'string' && value.trim();
  });
}

function resolveLocalSigningEnv(sourceEnv) {
  const localSigningEnv = fs.existsSync(LOCAL_SIGNING_ENV_PATH)
    ? loadEnvFile(LOCAL_SIGNING_ENV_PATH)
    : {};
  const signingEnv = Object.fromEntries(
    SIGNING_ENV_KEYS
      .map((key) => [
        key,
        firstEnvValue(sourceEnv, [key, key.replace('ANDROID_', 'ANDROID_RELEASE_')]) ||
          firstEnvValue(localSigningEnv, [key, key.replace('ANDROID_', 'ANDROID_RELEASE_')]),
      ])
      .filter(([, value]) => value),
  );

  if (signingEnv.ANDROID_KEYSTORE_PATH && !path.isAbsolute(signingEnv.ANDROID_KEYSTORE_PATH)) {
    signingEnv.ANDROID_KEYSTORE_PATH = path.resolve(ROOT_DIR, signingEnv.ANDROID_KEYSTORE_PATH);
  }

  return signingEnv;
}

function ensureParityInputs({ sourceEnv, mobileEnv }) {
  const missingPublicKeys = missingAuthCriticalKeys(mobileEnv);
  if (missingPublicKeys.length) {
    throw new Error(
      [
        'Missing auth-critical public env for Play-parity Android build:',
        missingPublicKeys.join(', '),
        'Set the same values used by .github/workflows/mobile-android-release.yml before building locally.',
      ].join(' '),
    );
  }

  if (!hasSigningEnv(sourceEnv)) {
    throw new Error(
      [
        'Missing Android release signing credentials for Play-parity Android build.',
        'Create config/android-signing.env from the same Expo/Play upload key, or export',
        SIGNING_ENV_KEYS.join(', '),
        'before running this helper. Plain assembleRelease APKs are not store-parity artifacts.',
      ].join(' '),
    );
  }
}

function buildFastlaneBaseEnv({ sourceEnv, mobileEnv }) {
  const signingEnv = resolveLocalSigningEnv(sourceEnv);

  return {
    ...process.env,
    EAS_PROJECT_ID: firstEnvValue(sourceEnv, ['EAS_PROJECT_ID']),
    EAS_PROJECT_ID_DEV: firstEnvValue(sourceEnv, ['EAS_PROJECT_ID_DEV', 'EXPO_PUBLIC_EAS_PROJECT_ID_DEV']),
    EXPO_PUBLIC_EAS_PROJECT_ID: firstEnvValue(sourceEnv, ['EXPO_PUBLIC_EAS_PROJECT_ID', 'EAS_PROJECT_ID']),
    EXPO_PUBLIC_EAS_PROJECT_ID_DEV: firstEnvValue(sourceEnv, [
      'EXPO_PUBLIC_EAS_PROJECT_ID_DEV',
      'EAS_PROJECT_ID_DEV',
    ]),
    EXPO_OWNER: firstEnvValue(sourceEnv, ['EXPO_OWNER']),
    EXPO_OWNER_DEV: firstEnvValue(sourceEnv, ['EXPO_OWNER_DEV']),
    ['EXPO_TOKEN']: firstEnvValue(sourceEnv, ['EXPO_TOKEN']),
    ['EXPO_TOKEN_DEV']: firstEnvValue(sourceEnv, ['EXPO_TOKEN_DEV']),
    ['SENTRY_AUTH_TOKEN']: firstEnvValue(sourceEnv, ['SENTRY_AUTH_TOKEN']),
    // Keep local .env, .env.local, and .env.production files out of parity
    // builds. The release workflow starts from a clean checkout and writes a
    // minimal mobile env; local machines often have broad private env files.
    EXPO_NO_DOTENV: '1',
    ANDROID_HOME: firstEnvValue(sourceEnv, ['ANDROID_HOME', 'ANDROID_SDK_ROOT']) || process.env.ANDROID_HOME,
    ANDROID_SDK_ROOT:
      firstEnvValue(sourceEnv, ['ANDROID_SDK_ROOT', 'ANDROID_HOME']) || process.env.ANDROID_SDK_ROOT,
    JAVA_HOME: firstEnvValue(sourceEnv, ['JAVA_HOME']) || process.env.JAVA_HOME,
    NODE_OPTIONS: firstEnvValue(sourceEnv, ['NODE_OPTIONS']) || process.env.NODE_OPTIONS,
    ...signingEnv,
    ...mobileEnv,
  };
}

function resolveBundletoolCommand(env = process.env) {
  if (env.BUNDLETOOL_JAR) {
    return { binary: 'java', args: ['-jar', env.BUNDLETOOL_JAR] };
  }

  const result = spawnSync('bundletool', ['version'], {
    encoding: 'utf8',
    stdio: 'ignore',
  });

  if (result.status === 0) {
    return { binary: 'bundletool', args: [] };
  }

  throw new Error(
    'Installing the Play-parity AAB requires bundletool on PATH or BUNDLETOOL_JAR=/path/to/bundletool.jar.',
  );
}

function runCommand(binary, args, { env = process.env, cwd = ROOT_DIR } = {}) {
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
    const command = [binary, ...args]
      .map(redactCommandArg)
      .join(' ');
    throw new Error(`Command failed: ${command}`);
  }
}

function redactCommandArg(arg) {
  return String(arg)
    .replace(/^(--(?:ks-pass|key-pass)=pass:).+$/, '$1[redacted]')
    .replace(
      /^(-Pandroid\.injected\.signing\.(?:store|key)\.password=).+$/,
      '$1[redacted]',
    );
}

function resolveGradleSigningArgs(env = process.env) {
  const signing = {
    storeFile: firstEnvValue(env, ['ANDROID_KEYSTORE_PATH', 'ANDROID_RELEASE_KEYSTORE_PATH']),
    storePassword: firstEnvValue(env, ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_RELEASE_KEYSTORE_PASSWORD']),
    keyAlias: firstEnvValue(env, ['ANDROID_KEY_ALIAS', 'ANDROID_RELEASE_KEY_ALIAS']),
    keyPassword: firstEnvValue(env, ['ANDROID_KEY_PASSWORD', 'ANDROID_RELEASE_KEY_PASSWORD']),
  };

  if (!Object.values(signing).every(Boolean)) {
    throw new Error('Gradle bundle build requires Android signing env so the AAB matches Play upload signing.');
  }

  if (!fs.existsSync(signing.storeFile)) {
    throw new Error(`Android keystore file not found: ${signing.storeFile}`);
  }

  return [
    `-Pandroid.injected.signing.store.file=${signing.storeFile}`,
    `-Pandroid.injected.signing.store.password=${signing.storePassword}`,
    `-Pandroid.injected.signing.key.alias=${signing.keyAlias}`,
    `-Pandroid.injected.signing.key.password=${signing.keyPassword}`,
  ];
}

function runGradleBundle({ env = process.env } = {}) {
  const gradlew = path.join(ANDROID_DIR, 'gradlew');
  if (!fs.existsSync(gradlew)) {
    throw new Error(`Gradle wrapper not found: ${gradlew}`);
  }

  runCommand(gradlew, [
    'bundleRelease',
    '--no-daemon',
    ...resolveGradleSigningArgs(env),
  ], {
    env,
    cwd: ANDROID_DIR,
  });
}

function runLocalGradleParityBuild({
  baseEnv = process.env,
  profile,
  track,
  rootEnvPath,
  mobileEnvPath,
} = {}) {
  const env = buildFastlaneEnv({
    baseEnv,
    profile,
    track,
    submit: false,
    rootEnvPath,
    mobileEnvPath,
  });
  const hadAndroidDir = fs.existsSync(ANDROID_DIR);

  try {
    runExpoPrebuild(env);
    runGradleBundle({ env });
  } finally {
    cleanGeneratedAndroidDir(hadAndroidDir);
  }
}

function installAabOnConnectedDevice({ aabPath = AAB_PATH, env = process.env } = {}) {
  const signing = {
    storeFile: firstEnvValue(env, ['ANDROID_KEYSTORE_PATH', 'ANDROID_RELEASE_KEYSTORE_PATH']),
    storePassword: firstEnvValue(env, ['ANDROID_KEYSTORE_PASSWORD', 'ANDROID_RELEASE_KEYSTORE_PASSWORD']),
    keyAlias: firstEnvValue(env, ['ANDROID_KEY_ALIAS', 'ANDROID_RELEASE_KEY_ALIAS']),
    keyPassword: firstEnvValue(env, ['ANDROID_KEY_PASSWORD', 'ANDROID_RELEASE_KEY_PASSWORD']),
  };

  if (!Object.values(signing).every(Boolean)) {
    throw new Error('AAB install requires Android signing env so bundletool can sign split APKs.');
  }

  if (!fs.existsSync(aabPath)) {
    throw new Error(`AAB not found: ${aabPath}`);
  }

  const bundletool = resolveBundletoolCommand(env);
  const apksPath = path.join(os.tmpdir(), `hashpass-play-parity-${Date.now()}.apks`);
  const sharedArgs = [bundletool.binary, ...bundletool.args];

  runCommand(sharedArgs[0], [
    ...sharedArgs.slice(1),
    'build-apks',
    `--bundle=${aabPath}`,
    `--output=${apksPath}`,
    '--overwrite',
    '--connected-device',
    `--ks=${signing.storeFile}`,
    `--ks-pass=pass:${signing.storePassword}`,
    `--ks-key-alias=${signing.keyAlias}`,
    `--key-pass=pass:${signing.keyPassword}`,
  ], { env });

  runCommand(sharedArgs[0], [
    ...sharedArgs.slice(1),
    'install-apks',
    `--apks=${apksPath}`,
  ], { env });

  return apksPath;
}

function buildLocalPlayParity({
  baseEnv = process.env,
  releaseEnv = DEFAULT_RELEASE_ENV,
  track = DEFAULT_TRACK,
  submit = false,
  install = false,
} = {}) {
  const normalizedEnv = normalizeReleaseEnvironment(releaseEnv);
  const profile = resolveReleaseProfile({ env: normalizedEnv });
  const sourceEnv = loadSourceEnv({ baseEnv });
  const parityEnv = createParityEnvFiles({ sourceEnv, releaseEnv: normalizedEnv });

  try {
    ensureParityInputs({ sourceEnv, mobileEnv: parityEnv.mobileEnv });
    const fastlaneBaseEnv = buildFastlaneBaseEnv({
      sourceEnv,
      mobileEnv: parityEnv.mobileEnv,
    });

    if (submit) {
      runFastlane({
        baseEnv: fastlaneBaseEnv,
        profile,
        track,
        submit: true,
        rootEnvPath: parityEnv.rootEnvPath,
        mobileEnvPath: parityEnv.mobileEnvPath,
      });
    } else {
      runLocalGradleParityBuild({
        baseEnv: fastlaneBaseEnv,
        profile,
        track,
        rootEnvPath: parityEnv.rootEnvPath,
        mobileEnvPath: parityEnv.mobileEnvPath,
      });
    }

    if (install) {
      installAabOnConnectedDevice({ aabPath: AAB_PATH, env: fastlaneBaseEnv });
    }

    return {
      profile,
      track,
      mobileEnv: parityEnv.mobileEnv,
      aabPath: AAB_PATH,
    };
  } finally {
    fs.rmSync(parityEnv.tempDir, { recursive: true, force: true });
  }
}

function printHelp() {
  console.log(
    [
      'Usage: node packages/tools/scripts/run-mobile-play-parity.js [--env development|production] [--track internal|alpha|production] [--install] [--submit]',
      '',
      'Builds the local Android artifact through the same release-signed AAB shape used by Play releases.',
      'Defaults to development/internal with no Play upload.',
      '',
      'Requirements:',
      '- Auth-critical EXPO_PUBLIC_* vars matching the mobile-android-release.yml workflow',
      '- Android release signing credentials in config/android-signing.env or exported env vars',
      '- bundletool on PATH or BUNDLETOOL_JAR only when --install is used',
    ].join('\n'),
  );
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }

  const options = parseParityArgs(argv);
  console.log(
    `Building Play-parity Android AAB locally (${options.releaseEnv}/${options.track}, submit=${options.submit}, install=${options.install})`,
  );
  const result = buildLocalPlayParity(options);
  console.log(`Play-parity AAB ready: ${result.aabPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  AAB_PATH,
  AUTH_CRITICAL_ENV_KEYS,
  DEFAULT_RELEASE_ENV,
  DEFAULT_TRACK,
  WORKFLOW_MOBILE_ENV_KEYS,
  buildFastlaneBaseEnv,
  buildLocalPlayParity,
  runGradleBundle,
  runLocalGradleParityBuild,
  createParityEnvFiles,
  ensureParityInputs,
  firstEnvValue,
  installAabOnConnectedDevice,
  loadSourceEnv,
  missingAuthCriticalKeys,
  parseParityArgs,
  redactCommandArg,
  resolveGradleSigningArgs,
  resolveWorkflowMobileEnv,
  resolveLocalSigningEnv,
};
