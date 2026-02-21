#!/usr/bin/env node

/**
 * HashPass Unified Environment Manager
 * 
 * Sources variables from the root .env based on the target environment profile.
 * Profiles are defined by suffixes like _DEV, _STAGING, or _PROD.
 * 
 * Usage:
 *   node tools/scripts/propagate-env.js [local|staging|production]
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(ROOT_DIR, 'apps');
const WEB_APP_DIR = path.join(APPS_DIR, 'web-app');

// Target environment from CLI or NODE_ENV
const envArg = process.argv[2] || process.env.NODE_ENV || 'local';

console.log(`🔍 Propagation target: ${envArg}`);

// 1. Load root .env
const rootEnvPath = path.join(ROOT_DIR, '.env');
if (!fs.existsSync(rootEnvPath)) {
    console.error('❌ Root .env not found!');
    process.exit(1);
}

const rootConfig = dotenv.parse(fs.readFileSync(rootEnvPath));

// 2. Define Mapping/Suffixes
const SUFFIX_MAP = {
    'local': '_DEV',
    'staging': '_STAGING',
    'production': '_PROD'
};

const suffix = SUFFIX_MAP[envArg] || '_DEV';

// 3. Extract and sanitize variables
const targetConfig = {};

// We want to extract:
// a) Global variables (no suffix)
// b) Environment specific overrides (key ends with suffix)
// c) EXPO_PUBLIC_* variables

const keys = Object.keys(rootConfig);

// First pass: Base and Global
keys.forEach(key => {
    // If it doesn't end with a known suffix, it's a base variable
    const hasSuffix = Object.values(SUFFIX_MAP).some(s => key.endsWith(s));
    if (!hasSuffix) {
        targetConfig[key] = rootConfig[key];
    }
});

// Second pass: Overrides
keys.forEach(key => {
    if (key.endsWith(suffix)) {
        const baseKey = key.slice(0, -suffix.length);
        targetConfig[baseKey] = rootConfig[key];
        console.log(`   ✨ Override found for: ${baseKey}`);
    }
});

// Final pass: Ensure NODE_ENV and target flags are correct
targetConfig['NODE_ENV'] = (envArg === 'production') ? 'production' : 'development';
targetConfig['EXPO_PUBLIC_ENV'] = envArg;

// 4. Generate .env file content
const envContent = Object.entries(targetConfig)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

// 5. Write to targets
const webAppEnvPath = path.join(WEB_APP_DIR, '.env');
const webAppEnvLocalPath = path.join(WEB_APP_DIR, `.env.${envArg}`);

console.log(`📝 Writing to ${webAppEnvPath}...`);
fs.writeFileSync(webAppEnvPath, envContent);

console.log(`📝 Writing to ${webAppEnvLocalPath}...`);
fs.writeFileSync(webAppEnvLocalPath, envContent);

console.log('✅ Environment propagation complete!');
