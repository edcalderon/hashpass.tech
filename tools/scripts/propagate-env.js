#!/usr/bin/env node

/**
 * HashPass Unified Environment Manager
 *
 * Sources variables from the root .env based on the target environment profile.
 * Profiles are defined by suffixes like _DEV or _PROD.
 * For non-local targets, canonical tenant URLs are enforced from tenant config.
 *
 * Usage:
 *   node tools/scripts/propagate-env.js [local|dev|production] [--tenant <name>] [--config <path>]
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  DEFAULT_CONFIG_PATH,
  normalizeEnvironment,
  resolveTenant,
} = require('./lib/tenant-config');

const ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(ROOT_DIR, 'apps');
const WEB_APP_DIR = path.join(APPS_DIR, 'web-app');
const DIRECTUS_DIR = path.join(APPS_DIR, 'directus');

function parseArgs(argv) {
  const options = {
    envArg: process.env.NODE_ENV || 'local',
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

  const raw = String(options.envArg || 'local').trim().toLowerCase();
  const isLocal = raw === 'local';
  const environment = isLocal ? 'local' : normalizeEnvironment(raw);

  return {
    ...options,
    envArg: raw,
    isLocal,
    environment,
  };
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

  console.error('❌ Root .env not found and no CI environment detected. Cannot propagate environments.');
  process.exit(1);
}

function mergeBySuffix(rootConfig, environment) {
  const suffix = environment === 'production' ? '_PROD' : environment === 'development' ? '_DEV' : null;
  const targetConfig = {};
  const keys = Object.keys(rootConfig);

  keys.forEach((key) => {
    const hasSuffix = key.endsWith('_DEV') || key.endsWith('_PROD');
    if (!hasSuffix) targetConfig[key] = rootConfig[key];
  });

  if (suffix) {
    keys.forEach((key) => {
      if (key.endsWith(suffix)) {
        const baseKey = key.slice(0, -suffix.length);
        targetConfig[baseKey] = rootConfig[key];
        console.log(`   ✨ Override found for: ${baseKey}`);
      }
    });
  }

  return targetConfig;
}

function applyCanonicalTenantOverrides(targetConfig, runtime) {
  const canonical = {
    EXPO_PUBLIC_SUPABASE_URL: runtime.supabaseUrl,
    DIRECTUS_URL: runtime.directusUrl,
    EXPO_PUBLIC_DIRECTUS_URL: runtime.directusUrl,
    EXPO_PUBLIC_API_BASE_URL: runtime.apiBaseUrl,
  };

  Object.entries(canonical).forEach(([key, value]) => {
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
  const isCiEnvironment = Boolean(process.env.CI || process.env.AWS_BRANCH);
  if (isCiEnvironment) {
    // Amplify/CI builds often do not expose service-role secrets.
    // Keep strict checks for local release tooling, but avoid blocking CI frontend builds.
    return;
  }

  const serviceRoleKey = targetConfig.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is missing for non-local propagation. ' +
      `Set SUPABASE_SERVICE_ROLE_KEY_${runtime.environment === 'production' ? 'PROD' : 'DEV'} in root .env.`
    );
  }

  const payload = decodeJwtPayload(serviceRoleKey);
  if (!payload || typeof payload.ref !== 'string') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not a decodable JWT with "ref" claim. ' +
      'Refusing to propagate to avoid releasing with wrong Supabase credentials.'
    );
  }

  if (runtime.supabaseRef && payload.ref !== runtime.supabaseRef) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY ref mismatch: got "${payload.ref}", expected "${runtime.supabaseRef}" ` +
      `for ${runtime.tenant}/${runtime.environment}. Add the correct SUPABASE_SERVICE_ROLE_KEY_${runtime.environment === 'production' ? 'PROD' : 'DEV'} to root .env.`
    );
  }
}

const options = parseArgs(process.argv.slice(2));
console.log(`🔍 Propagation target: ${options.envArg}`);

const rootConfig = loadRootEnv();
const targetConfig = mergeBySuffix(rootConfig, options.environment);

if (!options.isLocal) {
  const runtime = resolveTenant(options.tenant, options.environment, options.configPath);
  applyCanonicalTenantOverrides(targetConfig, runtime);
  validateSupabaseServiceRoleKey(targetConfig, runtime);
}

// Ensure NODE_ENV and target flags are correct
targetConfig.NODE_ENV = options.environment === 'production' ? 'production' : 'development';
targetConfig.EXPO_PUBLIC_ENV = options.envArg;

// Generate .env file content
const DISCLAIMER = `# ==============================================================================
# ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
# This file was generated from the root .env using tools/scripts/propagate-env.js
# Profile: ${options.envArg}
# Generated at: ${new Date().toISOString()}
# ==============================================================================

`;

const envContent = DISCLAIMER + Object.entries(targetConfig)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n');

// Write to targets
const webAppEnvPath = path.join(WEB_APP_DIR, '.env');
const webAppEnvLocalPath = path.join(WEB_APP_DIR, `.env.${options.envArg}`);

console.log(`📝 Writing to ${webAppEnvPath}...`);
fs.writeFileSync(webAppEnvPath, envContent);

console.log(`📝 Writing to ${webAppEnvLocalPath}...`);
fs.writeFileSync(webAppEnvLocalPath, envContent);

const directusEnvPath = path.join(DIRECTUS_DIR, '.env');
console.log(`📝 Writing to ${directusEnvPath}...`);
fs.writeFileSync(directusEnvPath, envContent);

console.log('✅ Environment propagation complete!');
