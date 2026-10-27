#!/usr/bin/env node

/**
 * Companion (apps/companion) release flow.
 *
 * - bumps the Companion app patch/minor/major version
 * - syncs the app-local changelog and version tracker
 * - validates the app-local versioning config
 * - commits, tags, and pushes a `companion-vX.Y.Z` release tag
 *
 * Mirrors packages/tools/scripts/release-club-web.js -- same shape, same
 * tagging/versioning conventions, scoped to apps/companion instead. See
 * apps/companion/versioning.config.json for the app-local config this
 * validates against.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const VALID_BUMPS = new Set(['patch', 'minor', 'major']);
const TAG_PREFIX = 'companion-v';
const COMPANION_DEPLOYMENT_GUARD = 'packages/tools/scripts/check-companion-deployment.mjs';
const STAGED_FILES = [
  'apps/companion/package.json',
  'apps/companion/README.md',
  'apps/companion/CHANGELOG.md',
  'apps/companion/src/config/version.ts',
  'apps/companion/src/config/versions.json',
  'apps/companion/src/config/git-info.json',
  'apps/companion/versioning.config.json',
];

function formatCommand(binary, args) {
  return [binary, ...args]
    .map((part) => (/\s/.test(part) ? `"${part}"` : part))
    .join(' ');
}

function runInherit(binary, args, options = {}) {
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

function runAndRead(binary, args, options = {}) {
  const commandText = formatCommand(binary, args);
  if (options.log !== false) console.log(`$ ${commandText}`);
  if (options.dryRun) return '';

  const result = spawnSync(binary, args, {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`Command failed: ${commandText}${stderr ? `\n${stderr}` : ''}`);
  }

  return (result.stdout || '').trim();
}

function parseArgs(argv) {
  const options = {
    bump: 'patch',
    publish: true,
    allowDirty: false,
    dryRun: false,
    noCommit: false,
    noTag: false,
    notes: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (VALID_BUMPS.has(String(arg).toLowerCase())) {
      options.bump = String(arg).toLowerCase();
      continue;
    }

    if (arg === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }

    if (arg === '--publish') {
      options.publish = true;
      continue;
    }

    if (arg === '--no-publish') {
      options.publish = false;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--no-commit') {
      options.noCommit = true;
      continue;
    }

    if (arg === '--no-tag') {
      options.noTag = true;
      continue;
    }

    if (arg === '--notes' && argv[index + 1]) {
      options.notes = String(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith('--notes=')) {
      options.notes = String(arg.split('=')[1] || '');
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node packages/tools/scripts/release-companion.js [patch|minor|major] [options]',
      '',
      'Options:',
      '  --publish             Push the release tag after creating it (default)',
      '  --no-publish          Skip pushing the release tag',
      '  --allow-dirty         Allow a dirty working tree',
      '  --dry-run             Print planned commands without running them',
      '  --no-commit           Skip the release commit',
      '  --no-tag              Skip the release tag',
      '  --notes "<text>"      Release notes for the changelog entry',
      '',
      'The release guard reads both live Companion hosts and refuses to release when',
      'production or development is newer than the source checkout. Set',
      'COMPANION_SKIP_LIVE_GUARD=1 only for an approved recovery.',
      '  -h, --help            Show this help',
      '',
      'Releases must run from "develop". Set',
      'COMPANION_RELEASE_SKIP_BRANCH_GUARD=1 to override in an emergency.',
    ].join('\n')
  );
}

function ensureCleanGitState(options) {
  if (options.allowDirty || options.dryRun) return;

  const status = runAndRead('git', ['status', '--porcelain'], { log: false });
  if (status.trim().length > 0) {
    throw new Error('Working tree is not clean. Commit or stash changes before releasing, or use --allow-dirty.');
  }
}

function getCurrentBranch() {
  const branch =
    runAndRead('git', ['branch', '--show-current'], { log: false }) ||
    runAndRead('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { log: false });

  if (!branch || branch === 'HEAD') {
    return 'unknown';
  }

  return branch.trim();
}

function readPackageVersion() {
  const packageJsonPath = path.join(ROOT_DIR, 'apps/companion/package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = packageJson?.version;

  if (!version || typeof version !== 'string') {
    throw new Error('Unable to read version from apps/companion/package.json');
  }

  return version;
}

function ensureLiveDeploymentOrder(options, sourceVersion) {
  if (options.dryRun) return;

  if (process.env.COMPANION_SKIP_LIVE_GUARD === '1') {
    console.warn('⚠️  COMPANION_SKIP_LIVE_GUARD=1 set -- skipping the live deployment order guard.');
    return;
  }

  const args = [COMPANION_DEPLOYMENT_GUARD, '--source-version', sourceVersion];
  if (process.env.COMPANION_PRODUCTION_URL) {
    args.push('--production-url', process.env.COMPANION_PRODUCTION_URL);
  }
  if (process.env.COMPANION_DEVELOPMENT_URL) {
    args.push('--development-url', process.env.COMPANION_DEVELOPMENT_URL);
  }

  runInherit('node', args, options);
}

function bumpVersion(version, bumpType = 'patch') {
  const parts = version.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  switch (bumpType) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

function runReleaseUpdate(nextVersion, options) {
  const args = [
    'packages/tools/scripts/update-companion-version.mjs',
    nextVersion,
    '--type=stable',
  ];

  if (options.notes) {
    args.push('--notes', options.notes);
  }

  runInherit('node', args, options);
}

function runVersioningValidate(options) {
  runInherit('pnpm', [
    '--dir',
    'apps/companion',
    'exec',
    'versioning',
    'validate',
    '--config',
    'versioning.config.json',
  ], options);
}

function runGitCommit(options, version) {
  if (options.noCommit || options.dryRun) return;

  runInherit('git', ['add', ...STAGED_FILES], options);
  runInherit('git', ['commit', '-m', `chore(companion): release v${version}`], options);
}

function runGitTag(options, version) {
  if (options.noCommit || options.noTag || options.dryRun) return;

  runInherit('git', ['tag', '-a', `${TAG_PREFIX}${version}`, '-m', `Companion v${version}`], options);
}

function ensureReleaseBranch(branch, options) {
  const requiredBranch = 'develop';
  if (branch === requiredBranch || options.dryRun) return;

  if (process.env.COMPANION_RELEASE_SKIP_BRANCH_GUARD === '1') {
    console.warn(
      `⚠️  COMPANION_RELEASE_SKIP_BRANCH_GUARD=1 set -- releasing "${TAG_PREFIX}*" from "${branch}" instead of "${requiredBranch}".`
    );
    return;
  }

  throw new Error(
    `Companion releases must run from "${requiredBranch}" (current branch: "${branch}"). ` +
    `A companion-v* tag from another branch can ship unmerged or unintended code. ` +
    `Set COMPANION_RELEASE_SKIP_BRANCH_GUARD=1 to override in an emergency.`
  );
}

function runGitPublish(options, version, branch) {
  if (options.noCommit || !options.publish || options.dryRun) return;

  // The release commit only reaches origin/develop via this branch push --
  // pushing just the tag transfers the tag object (and the commit objects
  // it points at) without advancing any branch, so the branch-triggered
  // Companion CI never fires and a fresh checkout of develop never sees the
  // version bump.
  runInherit('git', ['push', 'origin', branch], options);

  if (options.noTag) return;

  runInherit('git', ['push', 'origin', `${TAG_PREFIX}${version}`], options);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    const branch = getCurrentBranch();

    ensureReleaseBranch(branch, options);
    ensureCleanGitState(options);

    const currentVersion = readPackageVersion();
    ensureLiveDeploymentOrder(options, currentVersion);
    const bump = options.bump || 'patch';
    if (!VALID_BUMPS.has(bump)) {
      throw new Error(`Invalid bump type "${bump}"`);
    }

    const nextVersion = bumpVersion(currentVersion, bump);

    console.log('');
    console.log('Companion release plan');
    console.log(`  Branch:      ${branch}`);
    console.log(`  Current:     ${currentVersion}`);
    console.log(`  Next:        ${nextVersion}`);
    console.log(`  Bump:        ${bump}`);
    console.log(`  Tag:         ${TAG_PREFIX}${nextVersion}`);
    console.log(`  Publish:     ${options.publish ? 'yes' : 'no'}`);
    console.log(`  Dry run:     ${options.dryRun ? 'yes' : 'no'}`);
    console.log('');

    if (options.dryRun) {
      console.log('Dry run mode enabled. No files were changed.');
      return;
    }

    runReleaseUpdate(nextVersion, options);
    runVersioningValidate(options);
    runGitCommit(options, nextVersion);
    runGitTag(options, nextVersion);
    runGitPublish(options, nextVersion, branch);

    console.log('');
    console.log('Companion release completed successfully.');
    console.log(`  Version: ${nextVersion}`);
    console.log(`  Tag:     ${TAG_PREFIX}${nextVersion}`);
    console.log(`  Branch:  ${branch}`);
  } catch (error) {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
