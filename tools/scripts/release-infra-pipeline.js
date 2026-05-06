#!/usr/bin/env node

/**
 * Infra-focused release pipeline for HashPass.
 *
 * This is intentionally independent from the legacy release pipeline.
 * It reuses the shared version updater for the version bump / commit / tag /
 * push behavior, then deploys the new SST-based infra package.
 *
 * Default intent:
 * - production -> patch release + deploy to production
 * - development -> patch release + deploy to dev
 */

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');
const VERSION_UPDATE_SCRIPT = path.join(ROOT_DIR, 'tools', 'scripts', 'update-version.mjs');

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

function parseArgs(argv) {
  const options = {
    environment: 'production',
    bump: 'patch',
    push: true,
    allowDirty: false,
    dryRun: false,
    skipDeploy: false,
    help: false,
    releaseType: 'stable',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--env' && argv[i + 1]) {
      options.environment = String(argv[i + 1]).toLowerCase();
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.environment = String(arg.split('=')[1]).toLowerCase();
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

    if (arg === '--no-push') {
      options.push = false;
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

    if (arg === '--skip-deploy') {
      options.skipDeploy = true;
      continue;
    }

    if (arg === '--skip-version') {
      options.skipVersion = true;
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

    if (['patch', 'minor', 'major', 'none'].includes(String(arg).toLowerCase())) {
      options.bump = String(arg).toLowerCase();
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.environment === 'development' && options.bump === 'none') {
    options.bump = 'patch';
  }

  options.releaseType = options.environment === 'production' ? 'stable' : 'beta';

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node tools/scripts/release-infra-pipeline.js [options]',
      '  node tools/scripts/release-infra-pipeline.js <dev|prod> [patch|minor|major]',
      '',
      'Options:',
      '  --env <dev|prod>       Target release environment (default: production)',
      '  --bump <none|patch|minor|major>',
      '                         Semantic version bump (default: patch)',
      '  --no-push              Do not push the bump/tag back to origin',
      '  --allow-dirty          Allow a dirty git tree',
      '  --skip-deploy          Skip the SST infra deployment stage',
      '  --dry-run              Print planned commands without running them',
      '  -h, --help             Show this help',
      '',
      'Examples:',
      '  npm run release:infra:patch',
      '  npm run release:infra -- --env production --bump patch',
      '  npm run release:infra -- --env development --skip-deploy --dry-run',
    ].join('\n')
  );
}

function ensureCleanGitState(options) {
  if (options.allowDirty || options.dryRun) return;

  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error('Unable to check git status.');
  }

  if ((result.stdout || '').trim().length > 0) {
    throw new Error('Working tree is not clean. Commit/stash changes or use --allow-dirty.');
  }
}

function runVersionBump(options) {
  if (options.bump === 'none') return;

  const args = [options.bump, `--type=${options.releaseType}`, '--commit', '--tag'];
  runCommand('node', [VERSION_UPDATE_SCRIPT, ...args], options);
}

function pushReleaseCommit(options) {
  if (!options.push || options.dryRun) return;

  const currentBranch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (currentBranch.status !== 0) {
    throw new Error('Unable to determine the current git branch.');
  }

  const branchName = (currentBranch.stdout || '').trim();
  const targetBranch = branchName === 'HEAD' ? 'main' : branchName;
  const pushRef = `${branchName}:${targetBranch}`;

  runCommand('git', ['push', 'origin', pushRef], options);
  runCommand('git', ['push', 'origin', '--tags'], options);
}

function deployInfra(options) {
  if (options.skipDeploy) return;

  runCommand('bash', ['tools/scripts/check-infra-dns.sh'], options);
  const deployScript = options.environment === 'production' ? 'deploy:prod' : 'deploy:dev';
  runCommand('pnpm', ['--filter', '@hashpass/infra', 'run', deployScript], options);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }

    ensureCleanGitState(options);
    console.log('');
    console.log('Infra release plan');
    console.log(`  Environment: ${options.environment}`);
    console.log(`  Version bump: ${options.bump}`);
    console.log(`  Push:        ${options.push ? 'enabled' : 'skipped'}`);
    console.log(`  Deploy:      ${options.skipDeploy ? 'skipped' : 'enabled'}`);
    console.log(`  Dry run:     ${options.dryRun ? 'yes' : 'no'}`);
    console.log('');

    runVersionBump(options);
    pushReleaseCommit(options);
    deployInfra(options);

    console.log('Infra release pipeline completed successfully.');
  } catch (error) {
    console.error(`Infra release pipeline failed: ${error.message}`);
    process.exit(1);
  }
}

main();
