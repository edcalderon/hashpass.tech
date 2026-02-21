#!/usr/bin/env node

/**
 * HashPass Environment Sync Tool
 * 
 * Usage:
 *   node scripts/sync-env.js [--prod]
 */

const { execSync } = require('child_process');

const CONFIGS = {
    DEV: {
        lambda: 'hashpass-dev-api',
        supabase_url: 'https://fxgftanraszjjyeidvia.supabase.co',
        supabase_key: 'sb_publishable_iJeMRvvMCTiJJzo75egwog_BgQCUykM',
        supabase_service_role: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4Z2Z0YW5yYXN6amp5ZWlkdmlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY1NTQwOCwiZXhwIjoyMDg3MDE1NDA4fQ.vDw7pLXc1kgtVUqWQoFJqmLzERVRdTuiJLzIUjx2FMI',
        directus_url: 'https://sso-dev.hashpass.co',
        frontend_url: 'https://blockchainsummit-dev.hashpass.lat',
        node_env: 'dev'
    },
    PROD: {
        lambda: 'hashpass-prod-api',
        supabase_url: 'https://tgbdilebadmzqwubsijr.supabase.co',
        supabase_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYmRpbGViYWRtenF3dWJzaWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0NTMyNjIsImV4cCI6MjA3NjAyOTI2Mn0._jGaxGx2sRV74jwi6sXJrX6S1PrjB4hYFsQCJFZkn1E',
        supabase_service_role: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYmRpbGViYWRtenF3dWJzaWpyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDQ1MzI2MiwiZXhwIjoyMDc2MDI5MjYyfQ.WbLPvrQcKOnnI-4p66hmiVW1VFte-G8mzKR7ZpMTx-o',
        directus_url: 'https://sso.hashpass.co',
        frontend_url: 'https://blockchainsummit.hashpass.lat',
        node_env: 'production'
    }
};

const isProd = process.argv.includes('--prod');
const env = isProd ? CONFIGS.PROD : CONFIGS.DEV;

console.log(`🚀 Syncing ${isProd ? 'PROD' : 'DEV'} environment...`);

try {
    const configRaw = execSync(`aws lambda get-function-configuration --function-name ${env.lambda} --region us-east-1`).toString();
    const currentVars = JSON.parse(configRaw).Environment?.Variables || {};

    const newVars = {
        ...currentVars,
        EXPO_PUBLIC_SUPABASE_URL: env.supabase_url,
        EXPO_PUBLIC_SUPABASE_KEY: env.supabase_key,
        SUPABASE_SERVICE_ROLE_KEY: env.supabase_service_role,
        DIRECTUS_URL: env.directus_url,
        EXPO_PUBLIC_DIRECTUS_URL: env.directus_url,
        FRONTEND_URL: env.frontend_url,
        EXPO_PUBLIC_FRONTEND_URL: env.frontend_url,
        NODE_ENV: env.node_env
    };

    const varsStr = Object.entries(newVars).map(([k, v]) => `${k}="${v}"`).join(',');
    console.log(`Updating ${env.lambda}...`);
    execSync(`aws lambda update-function-configuration --function-name ${env.lambda} --region us-east-1 --environment "Variables={${varsStr}}"`, { stdio: 'inherit' });

    console.log(`✅ ${isProd ? 'PROD' : 'DEV'} synced successfully!`);
} catch (e) {
    console.error('Failed to sync:', e.message);
}
