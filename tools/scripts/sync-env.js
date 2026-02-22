#!/usr/bin/env node

/**
 * HashPass Environment Sync Tool (Hardenened)
 * 
 * Sources variables from the root .env to update AWS Lambda configurations.
 * NO HARDCODED SECRETS ALLOWED.
 * 
 * Usage:
 *   node tools/scripts/sync-env.js [dev|production]
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  DEFAULT_CONFIG_PATH,
  normalizeEnvironment,
  resolveTenant,
} = require('./lib/tenant-config');

const ROOT_DIR = path.resolve(__dirname, '../../');

function parseArgs(argv) {
  const options = {
    envArg: 'dev',
    tenant: process.env.TENANT || 'core',
    configPath: process.env.TENANT_CONFIG_PATH || DEFAULT_CONFIG_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--tenant' && argv[i + 1]) {
      options.tenant = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--tenant=')) {
      options.tenant = arg.split('=')[1];
      continue;
    }

    if (arg === '--config' && argv[i + 1]) {
      options.configPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--config=')) {
      options.configPath = arg.split('=')[1];
      continue;
    }

    if (arg === '--env' && argv[i + 1]) {
      options.envArg = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.envArg = arg.split('=')[1];
      continue;
    }

    if (!arg.startsWith('--')) {
      options.envArg = arg;
      continue;
    }
  }

  const environment = normalizeEnvironment(options.envArg);
  return { ...options, environment };
}

function loadRootEnv() {
  const rootEnvPath = path.join(ROOT_DIR, '.env');

  if (fs.existsSync(rootEnvPath)) {
    console.log('📄 Loading root .env file...');
    return dotenv.parse(fs.readFileSync(rootEnvPath));
  }

  console.warn(`⚠️ Root .env not found at ${rootEnvPath}`);
  if (process.env.CI || process.env.AWS_BRANCH) {
    console.log('☁️ CI environment detected. Falling back to process.env...');
    return { ...process.env };
  }

  console.error('❌ Root .env not found and no CI environment detected. Cannot sync environments.');
  process.exit(1);
}

function mergeBySuffix(rootConfig, environment) {
  const suffix = environment === 'production' ? '_PROD' : '_DEV';
  const targetConfig = {};
  const keys = Object.keys(rootConfig);

  keys.forEach((key) => {
    const hasSuffix = key.endsWith('_DEV') || key.endsWith('_PROD');
    if (!hasSuffix) targetConfig[key] = rootConfig[key];
  });

  keys.forEach((key) => {
    if (key.endsWith(suffix)) {
      const baseKey = key.slice(0, -suffix.length);
      targetConfig[baseKey] = rootConfig[key];
    }
  });

  return targetConfig;
}

function applyCanonicalTenantOverrides(targetConfig, runtime) {
  const canonicalEntries = [
    ['EXPO_PUBLIC_SUPABASE_URL', runtime.supabaseUrl],
    ['DIRECTUS_URL', runtime.directusUrl],
    ['EXPO_PUBLIC_DIRECTUS_URL', runtime.directusUrl],
    ['EXPO_PUBLIC_API_BASE_URL', runtime.apiBaseUrl],
  ];

  canonicalEntries.forEach(([key, value]) => {
    if (!value) return;
    targetConfig[key] = value;
  });
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = Buffer.from(payloadB64, 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function validateSupabaseServiceRoleKey(targetConfig, runtime) {
  const serviceRoleKey = targetConfig.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing for AWS sync. ' +
      `Set SUPABASE_SERVICE_ROLE_KEY_${runtime.environment === 'production' ? 'PROD' : 'DEV'} in root .env.`
    );
  }

  const payload = decodeJwtPayload(serviceRoleKey);
  if (!payload || typeof payload.ref !== 'string') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not a decodable JWT with "ref" claim. ' +
      'Refusing to sync to AWS with unknown Supabase credentials.'
    );
  }

  if (runtime.supabaseRef && payload.ref !== runtime.supabaseRef) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY ref mismatch: got "${payload.ref}", expected "${runtime.supabaseRef}" ` +
      `for ${runtime.tenant}/${runtime.environment}.`
    );
  }
}

function validateAuthDeliveryConfig(targetConfig, runtime) {
  const requiredMailVars = [
    'NODEMAILER_HOST',
    'NODEMAILER_PORT',
    'NODEMAILER_USER',
    'NODEMAILER_PASS',
    'NODEMAILER_FROM',
  ];

  const missingMailVars = requiredMailVars.filter(
    (key) => !String(targetConfig[key] || '').trim()
  );

  if (missingMailVars.length > 0) {
    throw new Error(
      `Missing required mail vars for ${runtime.tenant}/${runtime.environment}: ${missingMailVars.join(', ')}. ` +
      'Set them in root .env (or *_DEV/*_PROD overrides) before syncing.'
    );
  }
}

const options = parseArgs(process.argv.slice(2));

if (String(options.envArg).toLowerCase() === 'local') {
  console.error('❌ Syncing [local] to AWS is not allowed. Local environments should only use root .env variables on your machine.');
  process.exit(1);
}

const runtime = resolveTenant(options.tenant, options.environment, options.configPath);
const rootConfig = loadRootEnv();
const targetConfig = mergeBySuffix(rootConfig, options.environment);
applyCanonicalTenantOverrides(targetConfig, runtime);
validateSupabaseServiceRoleKey(targetConfig, runtime);
validateAuthDeliveryConfig(targetConfig, runtime);

const lambdaName = runtime.lambda.functionName;
const lambdaRegion = runtime.lambda.region;

console.log(`🚀 Syncing environment [${options.environment}] for tenant [${runtime.tenant}] to Lambda [${lambdaName}] (${lambdaRegion})...`);

try {
  const configRaw = execSync(
    `aws lambda get-function-configuration --function-name ${lambdaName} --region ${lambdaRegion}`
  ).toString();
  const currentVars = JSON.parse(configRaw).Environment?.Variables || {};

  const KEYS_TO_SYNC = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'DIRECTUS_URL',
    'EXPO_PUBLIC_DIRECTUS_URL',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'AUTH_PROVIDER',
    'DIRECTUS_OAUTH_SUPABASE_SYNC_ENABLED',
    'DIRECTUS_OAUTH_SUPABASE_BRIDGE_ENABLED',
    // OTP / transactional email + SMS delivery configuration
    'NODEMAILER_HOST',
    'NODEMAILER_PORT',
    'NODEMAILER_USER',
    'NODEMAILER_PASS',
    'NODEMAILER_FROM',
    'NODEMAILER_FROM_SUPPORT',
    'BREVO_API_KEY',
    'BREVO_SMS_SENDER',
  ];

  const newVars = { ...currentVars };
  KEYS_TO_SYNC.forEach((key) => {
    if (targetConfig[key] !== undefined) {
      newVars[key] = targetConfig[key];
    }
  });
  newVars.NODE_ENV = options.environment === 'production' ? 'production' : 'development';

  Object.keys(newVars).forEach((key) => {
    if (newVars[key] === undefined) delete newVars[key];
  });

  const varsStr = Object.entries(newVars)
    .map(([key, value]) => `${key}="${value}"`)
    .join(',');

  console.log(`📡 Updating ${lambdaName} in AWS ${lambdaRegion}...`);
  execSync(
    `aws lambda update-function-configuration --function-name ${lambdaName} --region ${lambdaRegion} --environment "Variables={${varsStr}}"`,
    { stdio: 'inherit' }
  );

  console.log(`✅ ${options.environment} synced successfully to AWS for tenant ${runtime.tenant}!`);
} catch (error) {
  console.error('❌ Failed to sync:', error.message);
  process.exit(1);
}
