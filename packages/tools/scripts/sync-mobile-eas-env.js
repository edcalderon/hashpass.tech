#!/usr/bin/env node
/* global __dirname, process */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

const { ROOT_DIR, runEas } = require('./run-mobile-eas');

const PROPAGATE_ENV_SCRIPT = path.join(ROOT_DIR, 'packages', 'tools', 'scripts', 'propagate-env.js');
const WEB_APP_ENV_PATH = path.join(ROOT_DIR, 'apps', 'web-app', '.env');
const DEFAULT_TENANT = 'core';
const EXPOSURE_EXCLUDED_KEYS = new Set([
  'EAS_PROJECT_ID',
  'EAS_PROJECT_ID_DEV',
  'EXPO_TOKEN',
  'EXPO_TOKEN_DEV',
  'EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
  'EXPO_PUBLIC_EAS_PROJECT_ID_DEV',
  'EXPO_PUBLIC_ENV',
  'NODE_ENV',
]);

function normalizeSyncEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized || normalized === 'production' || normalized === 'prod') {
    return 'production';
  }

  if (normalized === 'development' || normalized === 'dev' || normalized === 'preview') {
    return 'development';
  }

  throw new Error(`Unsupported sync environment: ${value}`);
}

function resolveExpoEnvironment(syncEnvironment) {
  return syncEnvironment === 'production' ? 'production' : 'preview';
}

function parseSyncArgs(argv = []) {
  const options = {
    env: process.env.EAS_SYNC_ENV || process.env.BUILD_ENV || 'production',
    tenant: process.env.TENANT || DEFAULT_TENANT,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--env' && argv[i + 1]) {
      options.env = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
      continue;
    }

    if (arg === '--tenant' && argv[i + 1]) {
      options.tenant = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--tenant=')) {
      options.tenant = arg.split('=')[1];
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return {
    ...options,
    env: normalizeSyncEnvironment(options.env),
    tenant: String(options.tenant || DEFAULT_TENANT).trim() || DEFAULT_TENANT,
  };
}

function runEnvPropagation(env, tenant) {
  const result = spawnSync('node', [PROPAGATE_ENV_SCRIPT, env, '--tenant', tenant], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Environment propagation failed for ${env} (${tenant}).`);
  }
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected propagated env file not found at ${filePath}`);
  }

  return dotenv.parse(fs.readFileSync(filePath));
}

function sanitizeExpoEnv(env) {
  const sanitized = {};

  for (const [key, value] of Object.entries(env || {})) {
    if (EXPOSURE_EXCLUDED_KEYS.has(key) || key.startsWith('EAS_') || key.startsWith('EXPO_PUBLIC_EAS_')) {
      continue;
    }

    if (value == null) {
      continue;
    }

    const stringValue = String(value);
    if (stringValue.trim() === '') {
      continue;
    }

    sanitized[key] = stringValue;
  }

  return sanitized;
}

function formatEnvFile(env) {
  return `${Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${JSON.stringify(String(value))}`)
    .join('\n')}\n`;
}

function writeTempEnvFile(env, syncEnvironment) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-eas-sync-'));
  const tempPath = path.join(tempDir, `expo-${syncEnvironment}.env`);
  fs.writeFileSync(tempPath, formatEnvFile(env), 'utf8');
  return tempPath;
}

function buildExpoPushEnv(filePath = WEB_APP_ENV_PATH) {
  return sanitizeExpoEnv(parseEnvFile(filePath));
}

function runSync({ env, tenant, dryRun } = {}) {
  const syncEnvironment = normalizeSyncEnvironment(env);
  const expoEnvironment = resolveExpoEnvironment(syncEnvironment);
  const profile = expoEnvironment === 'production' ? 'production' : 'preview';

  runEnvPropagation(syncEnvironment, tenant || DEFAULT_TENANT);
  const expoEnv = buildExpoPushEnv(WEB_APP_ENV_PATH);
  const tempEnvPath = writeTempEnvFile(expoEnv, syncEnvironment);

  if (dryRun) {
    return {
      env: syncEnvironment,
      expoEnvironment,
      profile,
      tempEnvPath,
    };
  }

  const result = runEas(['env:push', expoEnvironment, '--path', tempEnvPath, '--force'], { profile });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`EAS env:push failed for ${expoEnvironment}.`);
  }

  return {
    env: syncEnvironment,
    expoEnvironment,
    profile,
    tempEnvPath,
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        'Usage: node packages/tools/scripts/sync-mobile-eas-env.js [--env production|development] [--tenant core] [--dry-run]',
        '',
        'Development sync targets the Expo preview environment and production sync targets the Expo production environment.',
        'The helper propagates the repo env first, then pushes the sanitized payload to EAS.',
      ].join('\n'),
    );
    process.exit(0);
  }

  try {
    const options = parseSyncArgs(argv);
    const result = runSync(options);

    if (options.dryRun) {
      console.log(`Prepared ${result.expoEnvironment} payload at ${result.tempEnvPath}`);
      process.exit(0);
    }

    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  PROPAGATE_ENV_SCRIPT,
  WEB_APP_ENV_PATH,
  DEFAULT_TENANT,
  EXPOSURE_EXCLUDED_KEYS,
  normalizeSyncEnvironment,
  resolveExpoEnvironment,
  parseSyncArgs,
  runEnvPropagation,
  parseEnvFile,
  sanitizeExpoEnv,
  formatEnvFile,
  writeTempEnvFile,
  buildExpoPushEnv,
  runSync,
  main,
};
