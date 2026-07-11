#!/usr/bin/env node
/* global __dirname, Buffer */

/**
 * HASHPASS Environment Sync Tool (Hardenened)
 * 
 * Sources variables from the root .env to update AWS Lambda configurations.
 * NO HARDCODED SECRETS ALLOWED.
 * 
 * Usage:
 *   node packages/tools/scripts/sync-env.js [dev|production]
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  DEFAULT_CONFIG_PATH,
  normalizeEnvironment,
  resolveTenant,
} = require('./lib/tenant-config');

const ROOT_DIR = path.resolve(__dirname, '../../../');
const PROCESS_ENV_OVERRIDE_KEYS = [
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_SECRET_DEV',
  'BETTER_AUTH_SECRET_PROD',
  'BETTER_AUTH_GOOGLE_CLIENT_ID',
  'BETTER_AUTH_GOOGLE_CLIENT_SECRET',
  'BETTER_AUTH_GOOGLE_CLIENT_ID_DEV',
  'BETTER_AUTH_GOOGLE_CLIENT_ID_PROD',
  'BETTER_AUTH_GOOGLE_CLIENT_SECRET_DEV',
  'BETTER_AUTH_GOOGLE_CLIENT_SECRET_PROD',
  'EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN',
  'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'BETTER_AUTH_DATABASE_URL',
  'BETTER_AUTH_DATABASE_URL_DEV',
  'BETTER_AUTH_DATABASE_URL_PROD',
  'BSL_BETTER_AUTH_DATABASE_URL',
  'BSL_BETTER_AUTH_DATABASE_URL_DEV',
  'BSL_BETTER_AUTH_DATABASE_URL_PROD',
  'EXPO_PUBLIC_EVENT_TENANT',
  'EXPO_PUBLIC_EVENT_IDS',
];

function applyProcessEnvOverrides(config) {
  const nextConfig = { ...config };

  for (const key of PROCESS_ENV_OVERRIDE_KEYS) {
    if (process.env[key]) {
      nextConfig[key] = process.env[key];
    }
  }

  return nextConfig;
}

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
    return applyProcessEnvOverrides(dotenv.parse(fs.readFileSync(rootEnvPath)));
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

function stripEnvironmentSuffix(value) {
  return String(value || '').replace(/_(DEV|PROD)$/, '');
}

function resolveTenantSupabaseBindings(runtime) {
  const supabaseEnv = runtime.supabaseEnv || {};

  return {
    publicUrl: stripEnvironmentSuffix(supabaseEnv.publicUrl),
    publicKey: stripEnvironmentSuffix(supabaseEnv.publicKey),
    serviceRoleKey: stripEnvironmentSuffix(supabaseEnv.serviceRoleKey),
    databaseUrl: stripEnvironmentSuffix(supabaseEnv.databaseUrl),
  };
}

function applyCanonicalTenantOverrides(targetConfig, runtime) {
  const supabaseBindings = resolveTenantSupabaseBindings(runtime);
  const resolveBoundValue = (bindingKey, fallbackKeys = []) => {
    if (bindingKey && targetConfig[bindingKey]) {
      return targetConfig[bindingKey];
    }

    for (const fallbackKey of fallbackKeys) {
      if (targetConfig[fallbackKey]) {
        return targetConfig[fallbackKey];
      }
    }

    return '';
  };

  const supabaseUrl = resolveBoundValue(supabaseBindings.publicUrl, [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL_DEV',
    'EXPO_PUBLIC_SUPABASE_URL_PROD',
  ]) || runtime.supabaseUrl;
  const supabaseKey = resolveBoundValue(supabaseBindings.publicKey, [
    'EXPO_PUBLIC_SUPABASE_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_SUPABASE_KEY_DEV',
    'EXPO_PUBLIC_SUPABASE_KEY_PROD',
  ]);
  const serviceRoleFallbackKeys =
    runtime.environment === 'production'
      ? [
          'SUPABASE_SERVICE_ROLE_KEY_PROD',
          'SUPABASE_SERVICE_ROLE_KEY',
          'BSL_SUPABASE_SERVICE_ROLE_KEY_PROD',
          'SUPABASE_SERVICE_ROLE_KEY_BSL_PROD',
          'BSL_SUPABASE_SERVICE_ROLE_KEY',
        ]
      : [
          'BSL_SUPABASE_SERVICE_ROLE_KEY_DEV',
          'SUPABASE_SERVICE_ROLE_KEY_BSL_DEV',
          'BSL_SUPABASE_SERVICE_ROLE_KEY',
          'SUPABASE_SERVICE_ROLE_KEY_DEV',
          'SUPABASE_SERVICE_ROLE_KEY',
        ];
  const databaseFallbackKeys =
    runtime.environment === 'production'
      ? [
          'BSL_SUPABASE_DB_URL_PROD',
          'SUPABASE_DB_URL_BSL_PROD',
          'BSL_SUPABASE_DB_URL',
          'SUPABASE_DB_URL_PROD',
          'DATABASE_URL_PROD',
          'DATABASE_URL',
        ]
      : [
          'BSL_SUPABASE_DB_URL_DEV',
          'SUPABASE_DB_URL_BSL_DEV',
          'BSL_SUPABASE_DB_URL',
          'SUPABASE_DB_URL_DEV',
          'DATABASE_URL_DEV',
          'DATABASE_URL',
        ];
  const supabaseServiceRoleKey = resolveBoundValue(supabaseBindings.serviceRoleKey, serviceRoleFallbackKeys);
  const supabaseDatabaseUrl = resolveBoundValue(supabaseBindings.databaseUrl, databaseFallbackKeys);
  const betterAuthUrl = runtime.apiBaseUrl
    ? `${String(runtime.apiBaseUrl).trim().replace(/\/$/, '')}/auth`
    : '';
  const betterAuthTrustedOrigins = [
    'http://localhost:19006',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:3000',
    'https://hashpass.tech',
    'https://www.hashpass.tech',
    'https://hashpass.co',
    'https://www.hashpass.co',
    'https://bsl.hashpass.tech',
    'https://bsl-dev.hashpass.tech',
    'https://bsl2025.hashpass.tech',
    'https://bsl2025.hashpass.co',
    'https://blockchainsummit.hashpass.lat',
    'https://blockchainsummit-dev.hashpass.lat',
    'https://api.hashpass.tech',
    'https://api-dev.hashpass.tech',
    'https://sso-dev.hashpass.co',
  ].join(',');
  const betterAuthGoogleClientId = resolveBoundValue('BETTER_AUTH_GOOGLE_CLIENT_ID', [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_ID_DEV',
    'GOOGLE_CLIENT_ID_PROD',
  ]);
  const betterAuthGoogleClientSecret = resolveBoundValue('BETTER_AUTH_GOOGLE_CLIENT_SECRET', [
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CLIENT_SECRET_DEV',
    'GOOGLE_CLIENT_SECRET_PROD',
  ]);
  const nativeGoogleSignin = String(targetConfig.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN || '').trim() || 'false';
  const googleWebClientId = String(
    targetConfig.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
      betterAuthGoogleClientId ||
      targetConfig.GOOGLE_CLIENT_ID ||
      ''
  ).trim();
  const eventTenantByRuntimeTenant = {
    core: 'main',
    bsl: 'bsl',
    blockchainsummit: 'bsl2025',
  };
  const eventTenant =
    targetConfig.EXPO_PUBLIC_EVENT_TENANT ||
    eventTenantByRuntimeTenant[runtime.tenant] ||
    runtime.tenant;

  const canonicalEntries = [
    ['EXPO_PUBLIC_SUPABASE_URL', supabaseUrl],
    ['EXPO_PUBLIC_SUPABASE_KEY', supabaseKey],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', supabaseKey],
    ['EXPO_PUBLIC_SUPABASE_PROFILE', `${runtime.tenant}-${runtime.environment}`],
    ['SUPABASE_PROFILE', `${runtime.tenant}-${runtime.environment}`],
    ['SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey],
    ['SUPABASE_DB_URL', supabaseDatabaseUrl],
    ['DATABASE_URL', supabaseDatabaseUrl],
    ['DIRECTUS_URL', runtime.directusUrl],
    ['EXPO_PUBLIC_DIRECTUS_URL', runtime.directusUrl],
    ['EXPO_PUBLIC_API_BASE_URL', runtime.apiBaseUrl],
    ['EXPO_PUBLIC_BETTER_AUTH_URL', betterAuthUrl],
    ['EXPO_PUBLIC_BETTER_AUTH_BASE_PATH', '/api/auth'],
    ['BETTER_AUTH_URL', betterAuthUrl],
    ['BETTER_AUTH_BASE_PATH', '/api/auth'],
    ['BETTER_AUTH_DATABASE_URL', supabaseDatabaseUrl],
    ['BSL_BETTER_AUTH_DATABASE_URL', supabaseDatabaseUrl],
    ['BETTER_AUTH_TRUSTED_ORIGINS', betterAuthTrustedOrigins],
    ['GOOGLE_CLIENT_ID', betterAuthGoogleClientId],
    ['GOOGLE_CLIENT_SECRET', betterAuthGoogleClientSecret],
    ['BETTER_AUTH_GOOGLE_CLIENT_ID', betterAuthGoogleClientId],
    ['BETTER_AUTH_GOOGLE_CLIENT_SECRET', betterAuthGoogleClientSecret],
    ['EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', nativeGoogleSignin],
    ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', googleWebClientId],
    ['EXPO_PUBLIC_FRONTEND_URL', runtime.frontendUrl],
    ['EXPO_PUBLIC_EVENT_TENANT', eventTenant],
    ['FRONTEND_URL', runtime.frontendUrl],
    ['PUBLIC_URL', runtime.directusUrl],
  ];

  const environmentSuffix = runtime.environment === 'production' ? '_PROD' : '_DEV';
  const environmentSupabaseEntries = [
    [`EXPO_PUBLIC_SUPABASE_URL${environmentSuffix}`, supabaseUrl],
    [`EXPO_PUBLIC_SUPABASE_KEY${environmentSuffix}`, supabaseKey],
    [`EXPO_PUBLIC_SUPABASE_ANON_KEY${environmentSuffix}`, supabaseKey],
    [`SUPABASE_SERVICE_ROLE_KEY${environmentSuffix}`, supabaseServiceRoleKey],
    [`BSL_SUPABASE_SERVICE_ROLE_KEY${environmentSuffix}`, supabaseServiceRoleKey],
    [`SUPABASE_SERVICE_ROLE_KEY_BSL${environmentSuffix}`, supabaseServiceRoleKey],
    [`SUPABASE_DB_URL${environmentSuffix}`, supabaseDatabaseUrl],
    [`BSL_SUPABASE_DB_URL${environmentSuffix}`, supabaseDatabaseUrl],
    [`SUPABASE_DB_URL_BSL${environmentSuffix}`, supabaseDatabaseUrl],
    [`DATABASE_URL${environmentSuffix}`, supabaseDatabaseUrl],
    [`DATABASE_URL_BSL${environmentSuffix}`, supabaseDatabaseUrl],
  ];

  [...canonicalEntries, ...environmentSupabaseEntries].forEach(([key, value]) => {
    if (!value) return;
    targetConfig[key] = value;
  });

  const trimTrailingSlash = (value) => String(value || '').trim().replace(/\/$/, '');
  const splitCsv = (value) =>
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

  const mergeRedirectAllowList = (value) => {
    const allowList = new Set(splitCsv(value));
    const derivedCallbacks = [
      runtime.frontendUrl ? `${trimTrailingSlash(runtime.frontendUrl)}/auth/callback` : '',
      runtime.apiBaseUrl ? `${trimTrailingSlash(runtime.apiBaseUrl)}/auth/oauth/callback` : '',
    ].filter(Boolean);

    for (const entry of derivedCallbacks) {
      allowList.add(entry);
    }

    return Array.from(allowList).join(',');
  };

  targetConfig.AUTH_GOOGLE_REDIRECT_ALLOW_LIST = mergeRedirectAllowList(
    targetConfig.AUTH_GOOGLE_REDIRECT_ALLOW_LIST
  );
  targetConfig.AUTH_REDIRECT_ALLOW_LIST = mergeRedirectAllowList(
    targetConfig.AUTH_REDIRECT_ALLOW_LIST
  );

  const tenantAliasEntries = [
    [supabaseBindings.publicUrl, supabaseUrl],
    [supabaseBindings.publicKey, supabaseKey],
    [supabaseBindings.serviceRoleKey, supabaseServiceRoleKey],
    [supabaseBindings.databaseUrl, supabaseDatabaseUrl],
  ];

  tenantAliasEntries.forEach(([bindingKey, value]) => {
    if (!bindingKey || !value) return;
    targetConfig[bindingKey] = value;
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
      `Set the tenant-specific Supabase alias for ${runtime.tenant}/${runtime.environment} in root .env.`
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

function validateSupabaseAnonKey(targetConfig, runtime) {
  const anonKey = targetConfig.EXPO_PUBLIC_SUPABASE_KEY || targetConfig.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!anonKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_KEY is missing for AWS sync. ' +
      'Set the tenant-specific Supabase alias in root .env.'
    );
  }

  const payload = decodeJwtPayload(anonKey);
  if (payload && typeof payload.ref === 'string' && runtime.supabaseRef && payload.ref !== runtime.supabaseRef) {
    throw new Error(
      `EXPO_PUBLIC_SUPABASE_KEY ref mismatch: got "${payload.ref}", expected "${runtime.supabaseRef}" ` +
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
validateSupabaseAnonKey(targetConfig, runtime);
validateSupabaseServiceRoleKey(targetConfig, runtime);
validateAuthDeliveryConfig(targetConfig, runtime);

const lambdaName = runtime.lambda.functionName;
const lambdaRegion = runtime.lambda.region;

console.log(`🚀 Syncing environment [${options.environment}] for tenant [${runtime.tenant}] to Lambda [${lambdaName}] (${lambdaRegion})...`);

try {
  const configRaw = execFileSync(
    'aws',
    ['lambda', 'get-function-configuration', '--function-name', lambdaName, '--region', lambdaRegion],
    { encoding: 'utf8' }
  );
  const currentVars = JSON.parse(configRaw).Environment?.Variables || {};

  const KEYS_TO_SYNC = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL_DEV',
    'EXPO_PUBLIC_SUPABASE_URL_PROD',
    'EXPO_PUBLIC_SUPABASE_KEY',
    'EXPO_PUBLIC_SUPABASE_KEY_DEV',
    'EXPO_PUBLIC_SUPABASE_KEY_PROD',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY_DEV',
    'SUPABASE_SERVICE_ROLE_KEY_PROD',
    'BSL_SUPABASE_SERVICE_ROLE_KEY',
    'BSL_SUPABASE_SERVICE_ROLE_KEY_DEV',
    'BSL_SUPABASE_SERVICE_ROLE_KEY_PROD',
    'SUPABASE_SERVICE_ROLE_KEY_BSL_DEV',
    'SUPABASE_SERVICE_ROLE_KEY_BSL_PROD',
    'SUPABASE_DB_URL',
    'SUPABASE_DB_URL_DEV',
    'SUPABASE_DB_URL_PROD',
    'BSL_SUPABASE_DB_URL',
    'BSL_SUPABASE_DB_URL_DEV',
    'BSL_SUPABASE_DB_URL_PROD',
    'SUPABASE_DB_URL_BSL_DEV',
    'SUPABASE_DB_URL_BSL_PROD',
    'DATABASE_URL',
    'DATABASE_URL_DEV',
    'DATABASE_URL_PROD',
    'DATABASE_URL_BSL_DEV',
    'DATABASE_URL_BSL_PROD',
    'DIRECTUS_URL',
    'EXPO_PUBLIC_DIRECTUS_URL',
    'DIRECTUS_SECRET',
    'SESSION_COOKIE_NAME',
    'REFRESH_TOKEN_COOKIE_NAME',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'AUTH_GOOGLE_MODE',
    'AUTH_GOOGLE_REDIRECT_ALLOW_LIST',
    'AUTH_REDIRECT_ALLOW_LIST',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'DEFAULT_ROLE_ID',
    'EXPO_PUBLIC_FRONTEND_URL',
    'EXPO_PUBLIC_EVENT_TENANT',
    'EXPO_PUBLIC_EVENT_IDS',
    'FRONTEND_URL',
    'AUTH_PROVIDER',
    'EXPO_PUBLIC_BETTER_AUTH_URL',
    'EXPO_PUBLIC_BETTER_AUTH_BASE_PATH',
    'BETTER_AUTH_URL',
    'BETTER_AUTH_BASE_PATH',
    'BETTER_AUTH_SECRET',
    'BETTER_AUTH_SECRETS',
    'BETTER_AUTH_DATABASE_URL',
    'BSL_BETTER_AUTH_DATABASE_URL',
    'BETTER_AUTH_DATABASE_SSL',
    'BETTER_AUTH_TRUSTED_ORIGINS',
    'BETTER_AUTH_ALLOWED_HOSTS',
    'BETTER_AUTH_GOOGLE_CLIENT_ID',
    'BETTER_AUTH_GOOGLE_CLIENT_SECRET',
    'EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
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

  const tenantSupabaseKeys = Object.values(resolveTenantSupabaseBindings(runtime)).filter(Boolean);
  const syncKeys = [...new Set([...KEYS_TO_SYNC, ...tenantSupabaseKeys])];

  const newVars = { ...currentVars };
  syncKeys.forEach((key) => {
    if (targetConfig[key] !== undefined) {
      newVars[key] = targetConfig[key];
    }
  });
  newVars.NODE_ENV = options.environment === 'production' ? 'production' : 'development';

  const keysToDrop = [
    'BSL_BETTER_AUTH_DATABASE_URL',
    'BETTER_AUTH_TRUSTED_ORIGINS',
    'BETTER_AUTH_GOOGLE_CLIENT_ID',
    'BETTER_AUTH_GOOGLE_CLIENT_SECRET',
  ];
  keysToDrop.forEach((key) => {
    if (key in newVars) {
      delete newVars[key];
    }
  });

  Object.keys(newVars).forEach((key) => {
    if (newVars[key] === undefined) delete newVars[key];
  });

  const environmentPayload = JSON.stringify({ Variables: newVars });

  console.log(`📡 Updating ${lambdaName} in AWS ${lambdaRegion}...`);
  execFileSync(
    'aws',
    [
      'lambda',
      'update-function-configuration',
      '--function-name',
      lambdaName,
      '--region',
      lambdaRegion,
      '--environment',
      environmentPayload,
    ],
    { stdio: 'inherit' }
  );

  console.log(`✅ ${options.environment} synced successfully to AWS for tenant ${runtime.tenant}!`);
} catch (error) {
  console.error('❌ Failed to sync:', error.message);
  process.exit(1);
}
