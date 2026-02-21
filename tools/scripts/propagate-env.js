#!/usr/bin/env node

/**
 * HashPass Unified Environment Manager
 * 
 * Sources variables from the root .env based on the target environment profile.
 * Profiles are defined by suffixes like _DEV or _PROD.
 * 
 * Usage:
 *   node tools/scripts/propagate-env.js [local|dev|production]
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '../../');
const APPS_DIR = path.join(ROOT_DIR, 'apps');
const WEB_APP_DIR = path.join(APPS_DIR, 'web-app');
const DIRECTUS_DIR = path.join(APPS_DIR, 'directus');

// Target environment from CLI or NODE_ENV
const envArg = process.argv[2] || process.env.NODE_ENV || 'local';

console.log(`🔍 Propagation target: ${envArg}`);

// 1. Load root .env
const rootEnvPath = path.join(ROOT_DIR, '.env');
let rootConfig = {};

if (fs.existsSync(rootEnvPath)) {
    console.log('📄 Loading root .env file...');
    rootConfig = dotenv.parse(fs.readFileSync(rootEnvPath));
} else {
    console.warn(`⚠️ Root .env not found at ${rootEnvPath}`);
    if (process.env.CI || process.env.AWS_BRANCH) {
        console.log('☁️ CI environment detected. Falling back to process.env...');
        rootConfig = { ...process.env };
    } else {
        console.error('❌ Root .env not found and no CI environment detected. Cannot propagate environments.');
        process.exit(1);
    }
}

// 2. Define Mapping/Suffixes
const SUFFIX_MAP = {
    'dev': '_DEV',
    'production': '_PROD'
};

const suffix = SUFFIX_MAP[envArg] || null;

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
if (suffix) {
    keys.forEach(key => {
        if (key.endsWith(suffix)) {
            const baseKey = key.slice(0, -suffix.length);
            targetConfig[baseKey] = rootConfig[key];
            console.log(`   ✨ Override found for: ${baseKey}`);
        }
    });
}

// Final pass: Ensure NODE_ENV and target flags are correct
targetConfig['NODE_ENV'] = (envArg === 'production') ? 'production' : 'development';
targetConfig['EXPO_PUBLIC_ENV'] = envArg;

// 4. Generate .env file content
const DISCLAIMER = `# ==============================================================================
# ⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY
# This file was generated from the root .env using tools/scripts/propagate-env.js
# Profile: ${envArg}
# Generated at: ${new Date().toISOString()}
# ==============================================================================

`;

const envContent = DISCLAIMER + Object.entries(targetConfig)
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

const directusEnvPath = path.join(DIRECTUS_DIR, '.env');
console.log(`📝 Writing to ${directusEnvPath}...`);
fs.writeFileSync(directusEnvPath, envContent);

console.log('✅ Environment propagation complete!');
