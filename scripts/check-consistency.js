#!/usr/bin/env node

/**
 * HashPass Deployment Auditor & Consistency Tool
 * 
 * This tool verifies that environment variables in AWS Lambda and Amplify
 * match the expected "Source of Truth" for both Development and Production.
 * 
 * Usage:
 *   node scripts/check-consistency.js [--prod]
 */

const { execSync } = require('child_process');

// --- Configuration Constants ---

const PROJECTS = {
    DEV: {
        name: 'Development/Staging',
        supabase_ref: 'fxgftanraszjjyeidvia',
        directus_url: 'https://sso-dev.hashpass.co',
        frontend_url: 'https://blockchainsummit-dev.hashpass.lat',
        lambdas: [
            { name: 'hashpass-dev-api', region: 'us-east-1' }
        ],
        amplify: { appId: 'dy8duury54wam', region: 'us-east-2', branch: 'dev' }
    },
    PROD: {
        name: 'Production',
        supabase_ref: 'tgbdilebadmzqwubsijr',
        directus_url: 'https://sso.hashpass.co',
        frontend_url: 'https://blockchainsummit.hashpass.lat',
        lambdas: [
            { name: 'hashpass-prod-api', region: 'us-east-1' }
        ],
        amplify: { appId: 'dy8duury54wam', region: 'us-east-2', branch: 'main' }
    }
};

// --- Helper Functions ---

function log(msg, type = 'info') {
    const colors = {
        info: '\x1b[36m', // Cyan
        success: '\x1b[32m', // Green
        warn: '\x1b[33m', // Yellow
        error: '\x1b[31m', // Red
        reset: '\x1b[0m'
    };
    const prefix = {
        info: 'ℹ️ ',
        success: '✅ ',
        warn: '⚠️ ',
        error: '❌ '
    };
    console.log(`${colors[type] || ''}${prefix[type] || ''}${msg}\x1b[0m`);
}

function decodeJwt(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = Buffer.from(base64, 'base64').toString();
        return JSON.parse(jsonPayload);
    } catch (e) {
        return null;
    }
}

function getLambdaEnv(name, region) {
    try {
        const output = execSync(`aws lambda get-function-configuration --function-name ${name} --region ${region} --output json`, { stdio: 'pipe' });
        const config = JSON.parse(output.toString());
        return config.Environment?.Variables || {};
    } catch (e) {
        return null;
    }
}

function getAmplifyEnv(appId, region) {
    try {
        const output = execSync(`aws amplify get-app --app-id ${appId} --region ${region} --output json`, { stdio: 'pipe' });
        const config = JSON.parse(output.toString());
        return config.app.environmentVariables || {};
    } catch (e) {
        return null;
    }
}

// --- Audit Logic ---

async function audit(target) {
    const config = PROJECTS[target];
    log(`Starting Audit for ${config.name} (Project Ref: ${config.supabase_ref})`, 'info');
    console.log('------------------------------------------------------------');

    let totalIssues = 0;
    let suggestions = [];

    const expectedUrls = {
        EXPO_PUBLIC_SUPABASE_URL: `https://${config.supabase_ref}.supabase.co`,
        DIRECTUS_URL: config.directus_url,
        EXPO_PUBLIC_DIRECTUS_URL: config.directus_url,
        FRONTEND_URL: config.frontend_url
    };

    // 1. Audit Lambdas
    for (const lambda of config.lambdas) {
        const env = getLambdaEnv(lambda.name, lambda.region);
        if (!env) {
            log(`Lambda not found: ${lambda.name} in ${lambda.region}`, 'error');
            totalIssues++;
            continue;
        }

        log(`Auditing Lambda: ${lambda.name}`, 'info');

        let lambdaMismatches = {};

        // Check URLs
        for (const [key, expected] of Object.entries(expectedUrls)) {
            const actual = (env[key] || '').replace(/\/$/, '');
            const targetUrl = expected.replace(/\/$/, '');

            if (actual !== targetUrl) {
                log(`Mismatch in ${key}:`, 'error');
                console.log(`    Actual:   ${actual || '(unset)'}`);
                console.log(`    Expected: ${targetUrl}`);
                lambdaMismatches[key] = targetUrl;
                totalIssues++;
            }
        }

        // Check JWT consistency for Keys
        const keyVars = ['SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SUPABASE_KEY'];
        for (const key of keyVars) {
            const token = env[key];
            if (!token) {
                log(`Missing variable: ${key}`, 'error');
                totalIssues++;
                continue;
            }

            const payload = decodeJwt(token);
            if (!payload) {
                log(`Invalid JWT format: ${key}`, 'warn');
                continue;
            }

            if (payload.ref !== config.supabase_ref) {
                log(`JWT Project Mismatch in ${key}:`, 'error');
                console.log(`    JWT points to: ${payload.ref}`);
                console.log(`    Target Ref:    ${config.supabase_ref}`);
                totalIssues++;
            }
        }

        if (Object.keys(lambdaMismatches).length > 0) {
            const vars = Object.entries(lambdaMismatches).map(([k, v]) => `${k}=${v}`).join(',');
            suggestions.push(`aws lambda update-function-configuration --function-name ${lambda.name} --region ${lambda.region} --environment "Variables={$(aws lambda get-function-configuration --function-name ${lambda.name} --region ${lambda.region} --query 'Environment.Variables' --output text | sed 's/\\t/,/g' | sed 's/\\n//g'),${vars}}"`);
        }
        console.log('');
    }

    // 2. Audit Amplify (App-level fallbacks)
    log(`Auditing Amplify App: ${config.amplify.appId}`, 'info');
    const ampEnv = getAmplifyEnv(config.amplify.appId, config.amplify.region);
    if (ampEnv) {
        if (ampEnv.EXPO_PUBLIC_SUPABASE_URL) {
            const actual = ampEnv.EXPO_PUBLIC_SUPABASE_URL.split(' ')[0].replace(/\/$/, '');
            const expected = expectedUrls.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
            if (actual !== expected) {
                log(`Amplify App-level Mismatch: EXPO_PUBLIC_SUPABASE_URL`, 'warn');
                console.log(`    Actual:   ${actual}`);
                console.log(`    Expected: ${expected}`);
            }
        }
    }

    console.log('------------------------------------------------------------');
    if (totalIssues === 0) {
        log(`${config.name} is fully consistent! ✨`, 'success');
    } else {
        log(`${config.name} has ${totalIssues} consistency issues.`, 'error');
        if (suggestions.length > 0) {
            log('Suggestions to fix URL mismatches (Warning: overwrites env vars):', 'warn');
            suggestions.forEach(s => console.log(`\n${s}`));
        }
    }
}

// --- Entry Point ---

const isProd = process.argv.includes('--prod');
audit(isProd ? 'PROD' : 'DEV').catch(err => {
    console.error(err);
    process.exit(1);
});
