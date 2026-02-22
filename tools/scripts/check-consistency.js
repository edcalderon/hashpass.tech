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
        api_domain: 'api-dev.hashpass.tech',
        lambdas: [
            { name: 'hashpass-api-dev', region: 'us-east-1' }
        ],
        amplify: { appId: 'd951nuj7hrqeg', region: 'sa-east-1', branch: 'develop' }
    },
    PROD: {
        name: 'Production',
        supabase_ref: 'tgbdilebadmzqwubsijr',
        directus_url: 'https://sso.hashpass.co',
        frontend_url: 'https://blockchainsummit.hashpass.lat',
        api_domain: 'api.hashpass.tech',
        lambdas: [
            { name: 'hashpass-api-prod', region: 'us-east-1' }
        ],
        amplify: { appId: 'd951nuj7hrqeg', region: 'sa-east-1', branch: 'main' }
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

function getApiDomainMapping(domain, region) {
    try {
        const output = execSync(`aws apigatewayv2 get-api-mappings --domain-name ${domain} --region ${region} --output json`, { stdio: 'pipe' });
        const payload = JSON.parse(output.toString());
        return (payload.Items && payload.Items[0]) || null;
    } catch (e) {
        return null;
    }
}

function getApiProxyIntegration(apiId, region) {
    try {
        const output = execSync(`aws apigatewayv2 get-integrations --api-id ${apiId} --region ${region} --output json`, { stdio: 'pipe' });
        const payload = JSON.parse(output.toString());
        const integrations = payload.Items || [];
        return integrations.find(i => i.IntegrationType === 'AWS_PROXY') || integrations[0] || null;
    } catch (e) {
        return null;
    }
}

function lambdaPolicyAllowsApi(functionName, region, apiId) {
    try {
        const output = execSync(`aws lambda get-policy --function-name ${functionName} --region ${region} --output json`, { stdio: 'pipe' });
        const payload = JSON.parse(output.toString());
        const statements = JSON.parse(payload.Policy || '{}').Statement || [];
        return statements.some(statement => {
            const sourceArn = statement?.Condition?.ArnLike?.['AWS:SourceArn'] || statement?.Condition?.ArnLike?.['aws:SourceArn'] || '';
            return typeof sourceArn === 'string' && sourceArn.includes(`:${apiId}/`);
        });
    } catch (e) {
        return false;
    }
}

// --- Audit Logic ---

async function audit(target) {
    const config = PROJECTS[target];
    log(`Starting Audit for ${config.name} (Project Ref: ${config.supabase_ref})`, 'info');
    console.log('------------------------------------------------------------');

    let totalIssues = 0;
    let suggestions = [];

    const expectedUrlChecks = [
        ['EXPO_PUBLIC_SUPABASE_URL', `https://${config.supabase_ref}.supabase.co`],
        ['DIRECTUS_URL', config.directus_url],
        ['EXPO_PUBLIC_DIRECTUS_URL', config.directus_url],
        ['FRONTEND_URL', config.frontend_url]
    ];

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
        for (const [key, expected] of expectedUrlChecks) {
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

    // 2. Audit API Gateway domain mapping -> Lambda integration
    const apiRegion = config.lambdas[0]?.region || 'us-east-1';
    const expectedLambda = config.lambdas[0]?.name;
    log(`Auditing API domain mapping: ${config.api_domain}`, 'info');

    const mapping = getApiDomainMapping(config.api_domain, apiRegion);
    if (!mapping || !mapping.ApiId) {
        log(`No API mapping found for domain ${config.api_domain}`, 'error');
        totalIssues++;
    } else {
        const integration = getApiProxyIntegration(mapping.ApiId, apiRegion);
        if (!integration || !integration.IntegrationUri) {
            log(`No API integration found for API ${mapping.ApiId}`, 'error');
            totalIssues++;
        } else if (expectedLambda && !integration.IntegrationUri.includes(`function:${expectedLambda}`)) {
            log(`API integration mismatch for ${config.api_domain}:`, 'error');
            console.log(`    API ID:         ${mapping.ApiId}`);
            console.log(`    Integration ID: ${integration.IntegrationId}`);
            console.log(`    Actual URI:     ${integration.IntegrationUri}`);
            console.log(`    Expected func:  ${expectedLambda}`);
            totalIssues++;
            suggestions.push(`aws apigatewayv2 update-integration --region ${apiRegion} --api-id ${mapping.ApiId} --integration-id ${integration.IntegrationId} --integration-uri \"arn:aws:apigateway:${apiRegion}:lambda:path/2015-03-31/functions/$(aws lambda get-function --function-name ${expectedLambda} --region ${apiRegion} --query 'Configuration.FunctionArn' --output text)/invocations\"`);
        } else {
            log(`API integration points to expected Lambda (${expectedLambda})`, 'success');
        }

        if (expectedLambda && !lambdaPolicyAllowsApi(expectedLambda, apiRegion, mapping.ApiId)) {
            log(`Lambda permission missing for API Gateway -> ${expectedLambda}`, 'error');
            console.log(`    API ID: ${mapping.ApiId}`);
            totalIssues++;
            suggestions.push(`aws lambda add-permission --region ${apiRegion} --function-name ${expectedLambda} --statement-id AllowExecutionFromApiGateway-${mapping.ApiId} --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn arn:aws:execute-api:${apiRegion}:$(aws sts get-caller-identity --query 'Account' --output text):${mapping.ApiId}/*`);
        }
    }
    console.log('');

    // 3. Audit Amplify (App-level fallbacks)
    log(`Auditing Amplify App: ${config.amplify.appId}`, 'info');
    const ampEnv = getAmplifyEnv(config.amplify.appId, config.amplify.region);
    if (ampEnv) {
        if (ampEnv.EXPO_PUBLIC_SUPABASE_URL) {
            const actual = ampEnv.EXPO_PUBLIC_SUPABASE_URL.split(' ')[0].replace(/\/$/, '');
            const expected = expectedUrlChecks.find(([key]) => key === 'EXPO_PUBLIC_SUPABASE_URL')[1].replace(/\/$/, '');
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
