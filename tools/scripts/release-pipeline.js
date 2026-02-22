#!/usr/bin/env node

/**
 * Unified release pipeline for HashPass.
 *
 * Pipeline stages:
 * 1) Optional version bump + git commit/tag
 * 2) Optional push to remote branch/tags
 * 3) Lambda env sync (+ optional Lambda code deployment)
 * 4) Optional Directus deployment
 * 5) Amplify RELEASE jobs for one or all tenants
 *
 * Usage examples:
 *   node tools/scripts/release-pipeline.js --env development
 *   node tools/scripts/release-pipeline.js --env production --bump minor
 *   node tools/scripts/release-pipeline.js dev patch
 *   node tools/scripts/release-pipeline.js --env development --tenant core --dry-run
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');
const {
  DEFAULT_CONFIG_PATH,
  listTenants,
  normalizeEnvironment,
  resolveTenant,
} = require('./lib/tenant-config');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DONE_STATUSES = new Set(['SUCCEED', 'FAILED', 'CANCELLED']);
const VERSION_BUMPS = new Set(['none', 'patch', 'minor', 'major']);

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node tools/scripts/release-pipeline.js [options]',
      '  node tools/scripts/release-pipeline.js <dev|prod> [patch|minor|major]',
      '',
      'Options:',
      '  --env <dev|prod>          Target environment (default: development)',
      '  --bump <none|patch|minor|major>',
      '                            Optional semantic bump (default: none)',
      '  --tenant <name|all>       Tenant key or "all" (default: all)',
      '  --config <path>           Tenant config path',
      '  --no-wait                 Do not wait for Amplify jobs to finish',
      '  --no-push                 Do not push branch/tags',
      '  --skip-lambda             Skip Lambda sync/deploy stage',
      '  --lambda-env-only         Only sync Lambda env (skip Lambda code deploy)',
      '  --skip-directus           Skip Directus deployment stage',
      '  --skip-amplify            Skip Amplify release stage',
      '  --skip-consistency        Skip consistency audit stage',
      '  --allow-dirty             Allow running with local uncommitted changes',
      '  --dry-run                 Print planned commands without running them',
      '  -h, --help                Show this help',
      '',
      'Examples:',
      '  npm run release:dev',
      '  npm run release:dev -- patch',
      '  npm run release:prod -- minor',
      '  npm run release:pipeline -- --env development --tenant core --dry-run',
    ].join('\n')
  );
}

function sleep(ms) {
  if (ms <= 0) return;
  execSync(`sleep ${Math.ceil(ms / 1000)}`);
}

function formatCommand(binary, args) {
  return [binary, ...args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(' ');
}

function runCommand(binary, args, options = {}) {
  const commandText = formatCommand(binary, args);
  console.log(`$ ${commandText}`);
  if (options.dryRun) return;

  const result = spawnSync(binary, args, {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed: ${commandText}`);
  }
}

function runAndRead(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`Command failed: ${formatCommand(binary, args)}${stderr ? `\n${stderr}` : ''}`);
  }

  return (result.stdout || '').trim();
}

function runAndParseJson(binary, args) {
  const text = runAndRead(binary, args);
  try {
    return JSON.parse(text || '{}');
  } catch (_error) {
    throw new Error(`Invalid JSON output from: ${formatCommand(binary, args)}\n${text}`);
  }
}

function parseArgs(argv) {
  const options = {
    environment: 'development',
    bump: 'none',
    tenant: 'all',
    configPath: process.env.TENANT_CONFIG_PATH || DEFAULT_CONFIG_PATH,
    waitAmplify: true,
    push: true,
    runLambda: true,
    deployLambdaCode: true,
    runDirectus: true,
    runAmplify: true,
    runConsistency: true,
    allowDirty: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
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

    if (arg === '--bump' && argv[i + 1]) {
      options.bump = String(argv[i + 1]).toLowerCase();
      i += 1;
      continue;
    }

    if (arg.startsWith('--bump=')) {
      options.bump = String(arg.split('=')[1]).toLowerCase();
      continue;
    }

    if (arg === '--tenant' && argv[i + 1]) {
      options.tenant = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--tenant=')) {
      options.tenant = arg.split('=')[1];
      continue;
    }

    if (arg === '--all-tenants') {
      options.tenant = 'all';
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

    if (arg === '--no-wait') {
      options.waitAmplify = false;
      continue;
    }

    if (arg === '--no-push') {
      options.push = false;
      continue;
    }

    if (arg === '--skip-lambda') {
      options.runLambda = false;
      continue;
    }

    if (arg === '--lambda-env-only') {
      options.deployLambdaCode = false;
      continue;
    }

    if (arg === '--skip-directus') {
      options.runDirectus = false;
      continue;
    }

    if (arg === '--skip-amplify') {
      options.runAmplify = false;
      continue;
    }

    if (arg === '--skip-consistency') {
      options.runConsistency = false;
      continue;
    }

    if (arg === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === 'dev' || arg === 'develop' || arg === 'development') {
      options.environment = 'development';
      continue;
    }

    if (arg === 'prod' || arg === 'production' || arg === 'main') {
      options.environment = 'production';
      continue;
    }

    if (VERSION_BUMPS.has(String(arg).toLowerCase())) {
      options.bump = String(arg).toLowerCase();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!VERSION_BUMPS.has(options.bump)) {
    throw new Error(`Invalid --bump value "${options.bump}". Use none|patch|minor|major.`);
  }

  if (options.bump !== 'none' && !options.push && options.runAmplify) {
    throw new Error('When --bump is used with Amplify release, --no-push is not allowed.');
  }

  return options;
}

function ensureCleanGitState(options) {
  if (options.allowDirty || options.dryRun) return;
  const status = runAndRead('git', ['status', '--porcelain']);
  if (status.trim().length > 0) {
    throw new Error('Working tree is not clean. Commit/stash changes or use --allow-dirty.');
  }
}

function ensureBranch(expectedBranch, options) {
  const currentBranch = runAndRead('git', ['branch', '--show-current']);
  if (options.dryRun) {
    console.log(`Current branch: ${currentBranch || '(unknown)'} | Required: ${expectedBranch}`);
    return;
  }

  if (currentBranch !== expectedBranch) {
    throw new Error(
      `Release must run from branch "${expectedBranch}" for this environment. Current branch: "${currentBranch}".`
    );
  }
}

function printPlan(options, runtimes, targetBranch) {
  console.log('');
  console.log('Release plan');
  console.log(`  Environment:      ${options.environment}`);
  console.log(`  Branch:           ${targetBranch}`);
  console.log(`  Tenants:          ${runtimes.map((r) => r.tenant).join(', ')}`);
  console.log(`  Version bump:     ${options.bump}`);
  console.log(`  Lambda stage:     ${options.runLambda ? (options.deployLambdaCode ? 'env+code' : 'env-only') : 'skipped'}`);
  console.log(`  Directus stage:   ${options.runDirectus ? 'enabled' : 'skipped'}`);
  console.log(`  Amplify stage:    ${options.runAmplify ? (options.waitAmplify ? 'release+wait' : 'release only') : 'skipped'}`);
  console.log(`  Push:             ${options.push ? 'enabled' : 'skipped'}`);
  console.log(`  Dry run:          ${options.dryRun ? 'yes' : 'no'}`);
  console.log('');
}

function runConsistencyAudit(options) {
  if (!options.runConsistency) return;

  if (options.tenant === 'all') {
    runCommand(
      'node',
      ['tools/scripts/check-consistency.js', '--all-tenants', '--env', options.environment, '--config', options.configPath],
      options
    );
    return;
  }

  runCommand(
    'node',
    ['tools/scripts/check-consistency.js', '--tenant', options.tenant, '--env', options.environment, '--config', options.configPath],
    options
  );
}

function runVersionBump(options) {
  if (options.bump === 'none') return;
  const releaseType = options.environment === 'production' ? 'stable' : 'beta';
  runCommand(
    'node',
    ['tools/scripts/update-version.mjs', options.bump, `--type=${releaseType}`, '--commit', '--tag'],
    options
  );
}

function pushBranchAndTags(options, targetBranch) {
  if (!options.push) return;
  runCommand('git', ['push', 'origin', targetBranch], options);
  if (options.bump !== 'none') {
    runCommand('git', ['push', 'origin', '--tags'], options);
  }
}

function runLambdaStage(options, runtime) {
  if (!options.runLambda) return;

  const syncEnv = options.environment === 'production' ? 'production' : 'dev';
  const lambdaFunction = runtime.lambda.functionName;
  const lambdaRegion = runtime.lambda.region;

  runCommand(
    'node',
    ['tools/scripts/sync-env.js', syncEnv, '--tenant', runtime.tenant, '--config', options.configPath],
    options
  );
  runCommand('aws', ['lambda', 'wait', 'function-updated', '--function-name', lambdaFunction, '--region', lambdaRegion], options);

  if (!options.deployLambdaCode) return;

  runCommand(
    'node',
    ['tools/scripts/propagate-env.js', syncEnv, '--tenant', runtime.tenant, '--config', options.configPath],
    options
  );
  runCommand(
    'bash',
    ['-lc', `SKIP_ENV_PROPAGATE=1 BUILD_ENV=${syncEnv} pnpm --filter hashpass-web-app build`],
    options
  );
  runCommand('bash', ['tools/scripts/package-lambda.sh'], options);
  runCommand(
    'aws',
    [
      'lambda',
      'update-function-code',
      '--function-name',
      lambdaFunction,
      '--region',
      lambdaRegion,
      '--zip-file',
      'fileb://lambda-deployment.zip',
    ],
    options
  );
  runCommand('aws', ['lambda', 'wait', 'function-updated', '--function-name', lambdaFunction, '--region', lambdaRegion], options);
}

function runDirectusStage(options) {
  if (!options.runDirectus) return;
  runCommand('npm', ['run', 'deploy:directus'], options);
}

function startAmplifyJobs(options, runtimes) {
  if (!options.runAmplify) return [];
  const jobs = [];

  for (const runtime of runtimes) {
    const args = [
      'amplify',
      'start-job',
      '--app-id',
      runtime.amplify.appId,
      '--branch-name',
      runtime.branchName,
      '--job-type',
      'RELEASE',
      '--region',
      runtime.amplify.region,
      '--output',
      'json',
    ];

    if (options.dryRun) {
      runCommand('aws', args, options);
      jobs.push({
        tenant: runtime.tenant,
        appId: runtime.amplify.appId,
        region: runtime.amplify.region,
        jobId: '(dry-run)',
      });
      continue;
    }

    const payload = runAndParseJson('aws', args);
    const summary = payload.jobSummary || {};
    jobs.push({
      tenant: runtime.tenant,
      label: runtime.label,
      frontendUrl: runtime.frontendUrl,
      appId: runtime.amplify.appId,
      region: runtime.amplify.region,
      branchName: runtime.branchName,
      jobId: summary.jobId,
      status: summary.status || 'PENDING',
    });
  }

  return jobs;
}

function waitAmplifyJobs(options, jobs) {
  if (!options.runAmplify || !options.waitAmplify || options.dryRun) return jobs;

  const byJob = new Map();
  for (const job of jobs) {
    byJob.set(`${job.appId}:${job.jobId}:${job.region}`, job);
  }

  while (byJob.size > 0) {
    for (const [key, job] of byJob.entries()) {
      const payload = runAndParseJson('aws', [
        'amplify',
        'get-job',
        '--app-id',
        job.appId,
        '--branch-name',
        job.branchName,
        '--job-id',
        job.jobId,
        '--region',
        job.region,
        '--output',
        'json',
      ]);

      const summary = (payload.job && payload.job.summary) || {};
      job.status = summary.status || job.status;
      job.endTime = summary.endTime || null;

      if (DONE_STATUSES.has(job.status)) {
        byJob.delete(key);
      }
    }

    if (byJob.size > 0) sleep(15000);
  }

  return jobs;
}

function validateAmplifyResults(options, jobs) {
  if (!options.runAmplify || options.dryRun) return;
  const failed = jobs.filter((job) => job.status !== 'SUCCEED');
  if (failed.length > 0) {
    const details = failed
      .map((job) => `${job.tenant} (job ${job.jobId}, status ${job.status})`)
      .join(', ');
    throw new Error(`Amplify release failed: ${details}`);
  }
}

function printAmplifySummary(jobs) {
  if (!jobs.length) return;
  console.log('');
  console.log('Amplify release summary');
  for (const job of jobs) {
    console.log(
      `  - ${job.tenant}: status=${job.status} jobId=${job.jobId} appId=${job.appId} region=${job.region}${job.frontendUrl ? ` url=${job.frontendUrl}` : ''}`
    );
  }
  console.log('');
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }

    const tenantNames = options.tenant === 'all' ? listTenants(options.configPath) : [options.tenant];
    const runtimes = tenantNames.map((tenantName) =>
      resolveTenant(tenantName, options.environment, options.configPath)
    );

    if (runtimes.length === 0) {
      throw new Error('No tenants resolved for release.');
    }

    const targetBranch = runtimes[0].branchName;
    const lambdaFunction = runtimes[0].lambda.functionName;
    const lambdaRegion = runtimes[0].lambda.region;

    for (const runtime of runtimes) {
      if (runtime.branchName !== targetBranch) {
        throw new Error('Resolved tenants have different release branches. This pipeline requires a shared branch.');
      }
      if (
        runtime.lambda.functionName !== lambdaFunction ||
        runtime.lambda.region !== lambdaRegion
      ) {
        throw new Error('Resolved tenants have different Lambda targets. This pipeline expects one shared Lambda per environment.');
      }
    }

    ensureCleanGitState(options);
    ensureBranch(targetBranch, options);
    printPlan(options, runtimes, targetBranch);

    runConsistencyAudit(options);
    runVersionBump(options);
    pushBranchAndTags(options, targetBranch);
    runLambdaStage(options, runtimes[0]);
    runDirectusStage(options);

    const jobs = startAmplifyJobs(options, runtimes);
    waitAmplifyJobs(options, jobs);
    validateAmplifyResults(options, jobs);
    printAmplifySummary(jobs);

    console.log('Release pipeline completed successfully.');
  } catch (error) {
    console.error(`Release pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

main();
