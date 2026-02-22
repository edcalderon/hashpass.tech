const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_CONFIG_PATH = path.resolve(__dirname, '..', 'config', 'tenants.json');

function normalizeEnvironment(input) {
  const raw = String(input || 'development').trim().toLowerCase();

  if (raw === 'production' || raw === 'prod' || raw === 'main') return 'production';
  if (raw === 'development' || raw === 'dev' || raw === 'develop' || raw === 'staging') return 'development';

  throw new Error(`Unknown environment: ${input}. Use development|production.`);
}

function loadTenantConfig(configPath = DEFAULT_CONFIG_PATH) {
  const resolvedPath = path.resolve(configPath);
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== 'object' || !parsed.tenants || typeof parsed.tenants !== 'object') {
    throw new Error(`Invalid tenant config at ${resolvedPath}: missing "tenants" object`);
  }

  return {
    path: resolvedPath,
    config: parsed,
  };
}

function listTenants(configPath = DEFAULT_CONFIG_PATH) {
  const { config } = loadTenantConfig(configPath);
  return Object.keys(config.tenants).sort();
}

function resolveTenant(tenantName, environment = 'development', configPath = DEFAULT_CONFIG_PATH) {
  const env = normalizeEnvironment(environment);
  const { path: resolvedConfigPath, config } = loadTenantConfig(configPath);
  const tenant = config.tenants[tenantName];

  if (!tenant) {
    const known = Object.keys(config.tenants).sort().join(', ');
    throw new Error(`Unknown tenant "${tenantName}". Known tenants: ${known}`);
  }

  const defaults = config.defaults || {};
  const amplify = tenant.amplify || {};
  const appId = amplify.appId || '';
  const region = amplify.region || '';

  if (!appId || !region) {
    throw new Error(`Tenant "${tenantName}" is missing amplify.appId or amplify.region`);
  }

  const branchName =
    (defaults.releaseBranches && defaults.releaseBranches[env]) || (env === 'production' ? 'main' : 'develop');
  const directusUrl = defaults.directusUrls ? defaults.directusUrls[env] : '';
  const supabaseRef = defaults.supabaseRefs ? defaults.supabaseRefs[env] : '';
  const apiDomain = defaults.apiDomains ? defaults.apiDomains[env] : '';
  const apiBaseUrl = defaults.apiBaseUrls ? defaults.apiBaseUrls[env] : '';
  const frontendUrl = tenant.frontendUrls ? tenant.frontendUrls[env] : '';
  const lambdaRegion = defaults.lambda && defaults.lambda.region ? defaults.lambda.region : 'us-east-1';
  const lambdaFunction =
    defaults.lambda && defaults.lambda.functions ? defaults.lambda.functions[env] : '';
  const headersFileRelative = tenant.headersFile || defaults.headersFile || '';
  const headersFile = headersFileRelative ? path.resolve(REPO_ROOT, headersFileRelative) : '';

  return {
    tenant: tenantName,
    label: tenant.label || tenantName,
    environment: env,
    branchName,
    configPath: resolvedConfigPath,
    amplify: {
      appId,
      region,
    },
    directusUrl,
    supabaseRef,
    supabaseUrl: supabaseRef ? `https://${supabaseRef}.supabase.co` : '',
    apiDomain,
    apiBaseUrl,
    frontendUrl,
    headersFile,
    lambda: {
      region: lambdaRegion,
      functionName: lambdaFunction,
    },
  };
}

module.exports = {
  DEFAULT_CONFIG_PATH,
  listTenants,
  loadTenantConfig,
  normalizeEnvironment,
  resolveTenant,
};
