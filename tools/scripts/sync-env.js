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

const ROOT_DIR = path.resolve(__dirname, '../../');
const envArg = process.argv[2] || 'dev';

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
        console.error('❌ Root .env not found and no CI environment detected. Cannot sync environments.');
        process.exit(1);
    }
}

const SUFFIX_MAP = {
    'dev': '_DEV',
    'production': '_PROD'
};

if (envArg === 'local') {
    console.error('❌ Syncing [local] to AWS is not allowed. Local environments should only use root .env variables on your machine.');
    process.exit(1);
}

const suffix = SUFFIX_MAP[envArg] || '_DEV';
const targetConfig = {};

// 3. Extract variables using the same logic as propagate-env.js
const keys = Object.keys(rootConfig);
keys.forEach(key => {
    const hasSuffix = Object.values(SUFFIX_MAP).some(s => key.endsWith(s));
    if (!hasSuffix) targetConfig[key] = rootConfig[key];
});

keys.forEach(key => {
    if (key.endsWith(suffix)) {
        const baseKey = key.slice(0, -suffix.length);
        targetConfig[baseKey] = rootConfig[key];
    }
});

// 4. Lambda Mapping
const LAMBDA_NAME = envArg === 'production' ? 'hashpass-api-prod' : 'hashpass-api-dev';

console.log(`🚀 Syncing environment [${envArg}] to Lambda [${LAMBDA_NAME}]...`);

try {
    // Get current remote config
    const configRaw = execSync(`aws lambda get-function-configuration --function-name ${LAMBDA_NAME} --region us-east-1`).toString();
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
        'AUTH_PROVIDER'
    ];

    const newVars = { ...currentVars };
    KEYS_TO_SYNC.forEach(k => {
        if (targetConfig[k] !== undefined) {
            newVars[k] = targetConfig[k];
        }
    });
    newVars['NODE_ENV'] = envArg === 'production' ? 'production' : 'development';

    // Filter out any undefineds
    Object.keys(newVars).forEach(key => newVars[key] === undefined && delete newVars[key]);

    const varsStr = Object.entries(newVars).map(([k, v]) => `${k}="${v}"`).join(',');

    console.log(`📡 Updating ${LAMBDA_NAME} in AWS us-east-1...`);
    execSync(`aws lambda update-function-configuration --function-name ${LAMBDA_NAME} --region us-east-1 --environment "Variables={${varsStr}}"`, { stdio: 'inherit' });

    console.log(`✅ ${envArg} synced successfully to AWS!`);
} catch (e) {
    console.error('❌ Failed to sync:', e.message);
    process.exit(1);
}
