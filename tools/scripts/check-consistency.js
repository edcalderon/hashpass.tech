#!/usr/bin/env node

/**
 * HashPass Deployment Auditor & Consistency Tool
 *
 * Multi-tenant mode:
 * - Shared code/release cadence (`develop` / `main`)
 * - Tenant-specific Amplify app/region/domains
 *
 * Usage:
 *   node tools/scripts/check-consistency.js --tenant core
 *   node tools/scripts/check-consistency.js --tenant blockchainsummit --prod
 *   node tools/scripts/check-consistency.js --all-tenants --env development
 *   node tools/scripts/check-consistency.js --list-tenants
 */

const { execSync } = require('child_process');
const {
  DEFAULT_CONFIG_PATH,
  listTenants,
  normalizeEnvironment,
  resolveTenant,
} = require('./lib/tenant-config');

function log(message, type = 'info') {
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    warn: '\x1b[33m',
    error: '\x1b[31m',
  };
  const prefix = {
    info: 'ℹ️ ',
    success: '✅ ',
    warn: '⚠️ ',
    error: '❌ ',
  };

  console.log(`${colors[type] || ''}${prefix[type] || ''}${message}\x1b[0m`);
}

function parseArgs(argv) {
  const options = {
    tenant: process.env.TENANT || 'core',
    allTenants: false,
    listTenants: false,
    strict: false,
    environment: 'development',
    configPath: process.env.TENANT_CONFIG_PATH || DEFAULT_CONFIG_PATH,
    help: false,
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

    if (arg === '--env' && argv[i + 1]) {
      options.environment = normalizeEnvironment(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.environment = normalizeEnvironment(arg.split('=')[1]);
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

    if (arg === '--prod') {
      options.environment = 'production';
      continue;
    }

    if (arg === '--all-tenants') {
      options.allTenants = true;
      continue;
    }

    if (arg === '--list-tenants') {
      options.listTenants = true;
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node tools/scripts/check-consistency.js [options]',
      '',
      'Options:',
      '  --tenant <name>       Tenant key from tenant config (default: core)',
      '  --all-tenants         Run checks for every configured tenant',
      '  --env <dev|prod>      Environment (default: development)',
      '  --prod                Alias for --env production',
      '  --config <path>       Tenant config path',
      '  --list-tenants        List available tenant keys and exit',
      '  --strict              Exit with code 1 when issues are found',
      '  -h, --help            Show this help',
      '',
      'Examples:',
      '  node tools/scripts/check-consistency.js --tenant core',
      '  node tools/scripts/check-consistency.js --tenant blockchainsummit --prod',
      '  node tools/scripts/check-consistency.js --all-tenants --env development',
    ].join('\n')
  );
}

function runJson(command) {
  const raw = execSync(command, { stdio: 'pipe' }).toString();
  return JSON.parse(raw);
}

function decodeJwt(token) {
  if (!token || typeof token !== 'string') return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = Buffer.from(base64, 'base64').toString();
    return JSON.parse(payload);
  } catch (_err) {
    return null;
  }
}

function getLambdaEnv(functionName, region) {
  try {
    const config = runJson(
      `aws lambda get-function-configuration --function-name ${functionName} --region ${region} --output json`
    );
    return config.Environment && config.Environment.Variables ? config.Environment.Variables : {};
  } catch (_err) {
    return null;
  }
}

function getAmplifyAppEnv(appId, region) {
  try {
    const config = runJson(`aws amplify get-app --app-id ${appId} --region ${region} --output json`);
    return config.app && config.app.environmentVariables ? config.app.environmentVariables : {};
  } catch (_err) {
    return null;
  }
}

function getAmplifyBranchEnv(appId, region, branchName) {
  try {
    const config = runJson(
      `aws amplify get-branch --app-id ${appId} --branch-name ${branchName} --region ${region} --output json`
    );
    return config.branch && config.branch.environmentVariables ? config.branch.environmentVariables : {};
  } catch (_err) {
    return null;
  }
}

function getApiDomainMapping(domain, region) {
  try {
    const config = runJson(
      `aws apigatewayv2 get-api-mappings --domain-name ${domain} --region ${region} --output json`
    );
    return config.Items && config.Items.length > 0 ? config.Items[0] : null;
  } catch (_err) {
    return null;
  }
}

function getApiProxyIntegration(apiId, region) {
  try {
    const config = runJson(`aws apigatewayv2 get-integrations --api-id ${apiId} --region ${region} --output json`);
    const items = config.Items || [];
    return items.find((item) => item.IntegrationType === 'AWS_PROXY') || items[0] || null;
  } catch (_err) {
    return null;
  }
}

function lambdaPolicyAllowsApi(functionName, region, apiId) {
  try {
    const policyResponse = runJson(
      `aws lambda get-policy --function-name ${functionName} --region ${region} --output json`
    );
    const statements = JSON.parse(policyResponse.Policy || '{}').Statement || [];

    return statements.some((statement) => {
      const arnLike = (statement.Condition && statement.Condition.ArnLike) || {};
      const sourceArn = arnLike['AWS:SourceArn'] || arnLike['aws:SourceArn'] || '';
      return typeof sourceArn === 'string' && sourceArn.includes(`:${apiId}/`);
    });
  } catch (_err) {
    return false;
  }
}

function compareValue(actual, expected) {
  return String(actual || '').trim().replace(/\/$/, '') === String(expected || '').trim().replace(/\/$/, '');
}

async function auditTenant(tenantName, environment, configPath) {
  const runtime = resolveTenant(tenantName, environment, configPath);
  const contextTitle = `${runtime.label} [${runtime.tenant}] ${runtime.environment}`;

  log(`Starting audit: ${contextTitle}`, 'info');
  console.log('------------------------------------------------------------');

  let issues = 0;
  let warnings = 0;
  const suggestions = [];

  const lambdaName = runtime.lambda.functionName;
  const lambdaRegion = runtime.lambda.region;

  log(`Auditing Lambda: ${lambdaName} (${lambdaRegion})`, 'info');
  const lambdaEnv = getLambdaEnv(lambdaName, lambdaRegion);

  if (!lambdaEnv) {
    log(`Lambda not found or not readable: ${lambdaName}`, 'error');
    issues += 1;
  } else {
    const requiredLambdaChecks = [
      ['EXPO_PUBLIC_SUPABASE_URL', runtime.supabaseUrl],
      ['DIRECTUS_URL', runtime.directusUrl],
      ['EXPO_PUBLIC_DIRECTUS_URL', runtime.directusUrl],
    ].filter((pair) => Boolean(pair[1]));

    const lambdaMismatches = [];
    for (const [key, expected] of requiredLambdaChecks) {
      const actual = lambdaEnv[key] || '';
      if (!compareValue(actual, expected)) {
        log(`Lambda mismatch in ${key}:`, 'error');
        console.log(`    Actual:   ${actual || '(unset)'}`);
        console.log(`    Expected: ${expected}`);
        issues += 1;
        lambdaMismatches.push([key, expected]);
      }
    }

    const jwtKeys = ['SUPABASE_SERVICE_ROLE_KEY', 'EXPO_PUBLIC_SUPABASE_KEY'];
    for (const key of jwtKeys) {
      const token = lambdaEnv[key];
      if (!token) {
        log(`Missing lambda variable: ${key}`, 'error');
        issues += 1;
        continue;
      }

      const payload = decodeJwt(token);
      if (!payload) {
        log(`Cannot decode JWT value in ${key}`, 'warn');
        warnings += 1;
        continue;
      }

      if (runtime.supabaseRef && payload.ref && payload.ref !== runtime.supabaseRef) {
        log(`JWT project mismatch in ${key}:`, 'error');
        console.log(`    JWT ref:  ${payload.ref}`);
        console.log(`    Expected: ${runtime.supabaseRef}`);
        issues += 1;
      }
    }

    if (lambdaMismatches.length > 0) {
      const vars = lambdaMismatches.map(([key, value]) => `${key}=${value}`).join(',');
      suggestions.push(
        `aws lambda update-function-configuration --function-name ${lambdaName} --region ${lambdaRegion} --environment "Variables={$(aws lambda get-function-configuration --function-name ${lambdaName} --region ${lambdaRegion} --query 'Environment.Variables' --output text | sed 's/\\t/,/g' | sed 's/\\n//g'),${vars}}"`
      );
    }
  }
  console.log('');

  log(`Auditing API domain mapping: ${runtime.apiDomain}`, 'info');
  const mapping = getApiDomainMapping(runtime.apiDomain, lambdaRegion);

  if (!mapping || !mapping.ApiId) {
    log(`No API mapping found for ${runtime.apiDomain}`, 'error');
    issues += 1;
  } else {
    const integration = getApiProxyIntegration(mapping.ApiId, lambdaRegion);
    if (!integration || !integration.IntegrationUri) {
      log(`No integration found for API ${mapping.ApiId}`, 'error');
      issues += 1;
    } else if (!integration.IntegrationUri.includes(`function:${lambdaName}`)) {
      log(`API integration points to wrong Lambda`, 'error');
      console.log(`    API ID:        ${mapping.ApiId}`);
      console.log(`    Integration:   ${integration.IntegrationId}`);
      console.log(`    Actual URI:    ${integration.IntegrationUri}`);
      console.log(`    Expected func: ${lambdaName}`);
      issues += 1;

      suggestions.push(
        `aws apigatewayv2 update-integration --region ${lambdaRegion} --api-id ${mapping.ApiId} --integration-id ${integration.IntegrationId} --integration-uri "arn:aws:apigateway:${lambdaRegion}:lambda:path/2015-03-31/functions/$(aws lambda get-function --function-name ${lambdaName} --region ${lambdaRegion} --query 'Configuration.FunctionArn' --output text)/invocations"`
      );
    } else {
      log(`API integration points to expected Lambda (${lambdaName})`, 'success');
    }

    if (!lambdaPolicyAllowsApi(lambdaName, lambdaRegion, mapping.ApiId)) {
      log(`Lambda permission missing for API Gateway -> ${lambdaName}`, 'error');
      console.log(`    API ID: ${mapping.ApiId}`);
      issues += 1;
      suggestions.push(
        `aws lambda add-permission --region ${lambdaRegion} --function-name ${lambdaName} --statement-id AllowExecutionFromApiGateway-${mapping.ApiId} --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn arn:aws:execute-api:${lambdaRegion}:$(aws sts get-caller-identity --query 'Account' --output text):${mapping.ApiId}/*`
      );
    }
  }
  console.log('');

  log(`Auditing Amplify app: ${runtime.amplify.appId} (${runtime.amplify.region})`, 'info');
  const appEnv = getAmplifyAppEnv(runtime.amplify.appId, runtime.amplify.region);
  const branchEnv = getAmplifyBranchEnv(runtime.amplify.appId, runtime.amplify.region, runtime.branchName);

  if (!appEnv) {
    log(`Amplify app not found/readable: ${runtime.amplify.appId}`, 'error');
    issues += 1;
  } else if (!branchEnv) {
    log(`Amplify branch not found/readable: ${runtime.branchName}`, 'error');
    issues += 1;
  } else {
    const mergedAmplifyEnv = { ...appEnv, ...branchEnv };

    const requiredAmplifyChecks = [['EXPO_PUBLIC_API_BASE_URL', runtime.apiBaseUrl]];
    const optionalAmplifyChecks = [
      ['DIRECTUS_URL', runtime.directusUrl],
      ['EXPO_PUBLIC_DIRECTUS_URL', runtime.directusUrl],
      ['EXPO_PUBLIC_SUPABASE_URL', runtime.supabaseUrl],
    ];

    for (const [key, expected] of requiredAmplifyChecks) {
      const actual = mergedAmplifyEnv[key] || '';
      if (!compareValue(actual, expected)) {
        log(`Amplify mismatch in ${key} (${runtime.branchName}):`, 'error');
        console.log(`    Actual:   ${actual || '(unset)'}`);
        console.log(`    Expected: ${expected}`);
        issues += 1;
      }
    }

    for (const [key, expected] of optionalAmplifyChecks) {
      const actual = mergedAmplifyEnv[key] || '';
      if (!actual) {
        log(`Amplify variable not set (optional): ${key}`, 'warn');
        warnings += 1;
        continue;
      }

      if (!compareValue(actual, expected)) {
        log(`Amplify variable differs from expected: ${key}`, 'warn');
        console.log(`    Actual:   ${actual}`);
        console.log(`    Expected: ${expected}`);
        warnings += 1;
      }
    }

    const frontendKeys = ['EXPO_PUBLIC_FRONTEND_URL', 'FRONTEND_URL'];
    const frontendSet = frontendKeys.filter((key) => Boolean(mergedAmplifyEnv[key]));
    if (frontendSet.length === 0) {
      log(`Amplify frontend URL variables are unset (optional): ${frontendKeys.join(', ')}`, 'warn');
      warnings += 1;
    } else {
      for (const key of frontendSet) {
        const actual = mergedAmplifyEnv[key];
        if (!compareValue(actual, runtime.frontendUrl)) {
          log(`Amplify frontend URL differs from tenant domain in ${key}`, 'warn');
          console.log(`    Actual:   ${actual}`);
          console.log(`    Expected: ${runtime.frontendUrl}`);
          warnings += 1;
        }
      }
    }
  }
  console.log('');

  console.log('------------------------------------------------------------');
  if (issues === 0) {
    log(`Audit completed without blocking issues: ${contextTitle}`, 'success');
  } else {
    log(`Audit found ${issues} issue(s): ${contextTitle}`, 'error');
  }

  if (warnings > 0) {
    log(`Audit warnings: ${warnings}`, 'warn');
  }

  if (suggestions.length > 0) {
    log('Suggested commands:', 'warn');
    for (const suggestion of suggestions) {
      console.log(`\n${suggestion}`);
    }
  }

  console.log('');
  return { issues, warnings };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (options.listTenants) {
    const tenants = listTenants(options.configPath);
    console.log(tenants.join('\n'));
    return;
  }

  const tenants = options.allTenants ? listTenants(options.configPath) : [options.tenant];
  let totalIssues = 0;
  let totalWarnings = 0;

  for (const tenantName of tenants) {
    const result = await auditTenant(tenantName, options.environment, options.configPath);
    totalIssues += result.issues;
    totalWarnings += result.warnings;
  }

  if (tenants.length > 1) {
    console.log('============================================================');
    if (totalIssues === 0) {
      log(`All tenant audits passed (warnings: ${totalWarnings})`, 'success');
    } else {
      log(`Tenant audits completed with ${totalIssues} issue(s) and ${totalWarnings} warning(s)`, 'error');
    }
  }

  if (options.strict && totalIssues > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});
