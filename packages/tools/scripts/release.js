#!/usr/bin/env node

/**
 * Branch-aware release orchestrator for HashPass.
 *
 * Behavior:
 * - detects the current branch automatically
 * - runs versioning preflight checks
 * - bumps patch/minor/major with branch-aware build handling
 * - commits changelog/version updates and tags the release
 * - optionally opens a develop -> main promotion PR
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const VERSIONING_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const DEFAULT_CONFIG = 'versioning.config.json';
const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

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

function switchBranch(branch, options = {}) {
  runInherit('git', ['switch', branch], options);
}

function stashDirtyWorktree(options = {}) {
  if (!options.allowDirty || options.dryRun) return false;
  if (isCleanTree()) return false;

  runInherit('git', ['stash', 'push', '-u', '-m', 'codex-release-auto-stash', '--', '.'], options);
  return true;
}

function restoreDirtyWorktree(options = {}) {
  if (!options.allowDirty || options.dryRun) return;

  runInherit('git', ['stash', 'pop', '--index'], options);
}

function getCurrentBranch() {
  const envBranch =
    process.env.RELEASE_BRANCH ||
    process.env.GITHUB_REF_NAME ||
    process.env.CI_COMMIT_BRANCH ||
    process.env.BRANCH_NAME ||
    '';

  if (envBranch) return String(envBranch).trim();

  const branch =
    runAndRead('git', ['branch', '--show-current'], { log: false }) ||
    runAndRead('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { log: false });

  if (!branch || branch === 'HEAD') {
    throw new Error('Unable to detect the current branch. Check out main, develop, or pass RELEASE_BRANCH.');
  }

  return branch.trim();
}

function isCleanTree() {
  const output = runAndRead('git', ['status', '--porcelain'], { log: false });
  return output.trim().length === 0;
}

function readJsonVersion(relativePath) {
  const filePath = path.join(ROOT_DIR, relativePath);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const version = content?.version;
  if (!version || typeof version !== 'string') {
    throw new Error(`Unable to read version from ${relativePath}`);
  }
  return version;
}

function syncJsonVersion(relativePath, version) {
  const filePath = path.join(ROOT_DIR, relativePath);
  if (!fs.existsSync(filePath)) return;

  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (content?.version === version) return;

  content.version = version;
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`);
  console.log(`✅ Synced ${relativePath}: version = ${version}`);
}

function parseArgs(argv) {
  const options = {
    bump: 'patch',
    branch: '',
    promote: false,
    promoteOnly: false,
    push: true,
    allowDirty: false,
    dryRun: false,
    noCommit: false,
    noTag: false,
    config: DEFAULT_CONFIG,
    message: '',
    branchAware: true,
    forceBranchAware: false,
    format: '',
    build: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (VALID_BUMPS.has(String(arg).toLowerCase())) {
      options.bump = String(arg).toLowerCase();
      continue;
    }

    if (arg === '--bump' && argv[i + 1]) {
      const value = String(argv[i + 1]).toLowerCase();
      if (!VALID_BUMPS.has(value)) {
        throw new Error(`Unknown bump type: ${argv[i + 1]}`);
      }
      options.bump = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--bump=')) {
      const value = String(arg.split('=')[1]).toLowerCase();
      if (!VALID_BUMPS.has(value)) {
        throw new Error(`Unknown bump type: ${arg.split('=')[1]}`);
      }
      options.bump = value;
      continue;
    }

    if (arg === '--branch' && argv[i + 1]) {
      options.branch = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--branch=')) {
      options.branch = String(arg.split('=')[1]).trim();
      continue;
    }

    if (arg === '--target-branch' && argv[i + 1]) {
      options.branch = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--target-branch=')) {
      options.branch = String(arg.split('=')[1]).trim();
      continue;
    }

    if (arg === '--promote' || arg === '--promote-to-main') {
      options.promote = true;
      continue;
    }

    if (arg === '--promote-only') {
      options.promoteOnly = true;
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

    if (arg === '--no-commit') {
      options.noCommit = true;
      continue;
    }

    if (arg === '--no-tag') {
      options.noTag = true;
      continue;
    }

    if (arg === '--config' && argv[i + 1]) {
      options.config = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--config=')) {
      options.config = String(arg.split('=')[1]).trim();
      continue;
    }

    if (arg === '--message' && argv[i + 1]) {
      options.message = String(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith('--message=')) {
      options.message = String(arg.split('=')[1]);
      continue;
    }

    if (arg === '--format' && argv[i + 1]) {
      options.format = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      options.format = String(arg.split('=')[1]).trim();
      continue;
    }

    if (arg === '--build' && argv[i + 1]) {
      options.build = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--build=')) {
      options.build = String(arg.split('=')[1]).trim();
      continue;
    }

    if (arg === '--force-branch-aware') {
      options.forceBranchAware = true;
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
      '  node packages/tools/scripts/release.js [patch|minor|major] [options]',
      '',
      'Options:',
      '  --branch <name>           Override the detected branch',
      '  --target-branch <name>    Alias for --branch',
      '  --promote                 Prepare a develop -> main promotion PR',
      '  --promote-to-main         Alias for --promote',
      '  --promote-only            Alias for the promotion PR prep path',
      '  --no-push                 Skip git push',
      '  --allow-dirty             Allow a dirty working tree',
      '  --dry-run                 Print planned commands without running them',
      '  --no-commit               Skip the release commit',
      '  --no-tag                  Skip the release tag',
      '  --config <path>           Versioning config file (default: versioning.config.json)',
      '  --message <text>          Release commit message override',
      '  --format <format>         Override version format for branch-aware release',
      '  --build <number>          Override build number for dev/feature releases',
      '  --force-branch-aware      Force branch-aware mode even if config changes',
      '  -h, --help                Show this help',
      '',
      'Examples:',
      '  npm run release -- patch',
      '  npm run release:minor',
      '  npm run release:promote',
      '  npm run release -- patch --branch main',
      '  npm run release -- major --branch main',
      '',
      'Promote flow:',
      '  develop prep -> PR to main -> codeowner approval -> merge -> main release',
    ].join('\n')
  );
}

function ensureCleanGitState(options) {
  if (options.allowDirty || options.dryRun) return;

  if (!isCleanTree()) {
    throw new Error('Working tree is not clean. Commit or stash changes before releasing, or use --allow-dirty.');
  }
}

function runPreflight(options) {
  runInherit(VERSIONING_BIN, ['exec', 'versioning', 'check-secrets'], options);
  runInherit(VERSIONING_BIN, ['exec', 'versioning', 'cleanup', 'scan'], options);
  runInherit(VERSIONING_BIN, ['run', 'typecheck'], options);
  runInherit(VERSIONING_BIN, ['exec', 'versioning', 'validate', '--config', options.config], options);
}

function buildVersioningArgs(options, branch) {
  const args = [options.bump, '--config', options.config, '--branch-aware', '--target-branch', branch];

  if (options.forceBranchAware) args.push('--force-branch-aware');
  if (options.format) args.push('--format', options.format);
  if (options.build) args.push('--build', options.build);
  if (options.message) args.push('--message', options.message);
  if (options.noCommit) args.push('--no-commit');
  if (options.noTag) args.push('--no-tag');
  if (options.push && !options.noCommit) {
    // The release command handles commit/tag generation; pushing happens separately.
  }

  return args;
}

function runRelease(options, branch) {
  const args = buildVersioningArgs(options, branch);
  runInherit(VERSIONING_BIN, ['exec', 'versioning', ...args], options);
}

function runMainRelease(options, branch) {
  const mainOptions = {
    ...options,
    noCommit: true,
    noTag: true,
  };

  runInherit(VERSIONING_BIN, ['exec', 'versioning', ...buildVersioningArgs(mainOptions, branch)], options);

  const releaseVersion = readJsonVersion('package.json');
  runInherit('node', [
    'packages/tools/scripts/update-version.mjs',
    releaseVersion,
    '--type=stable',
    '--skip-git-info',
  ], options);

  syncJsonVersion('apps/mobile-app/config/version.production.json', releaseVersion);
  syncJsonVersion('apps/mobile-app/config/version.development.json', releaseVersion);

  return releaseVersion;
}

function getExactTagForHead(options) {
  if (options.dryRun || options.noTag) return '';

  const result = spawnSync('git', ['describe', '--tags', '--exact-match', 'HEAD'], {
    cwd: ROOT_DIR,
    env: process.env,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function runGitPush(options, branch) {
  if (!options.push || options.noCommit || options.dryRun) return;
  runInherit('git', ['push', 'origin', branch, '--follow-tags'], options);
  runInherit('git', ['push', 'upstream', branch, '--follow-tags'], options);
}

function runGitCommit(options, version) {
  if (options.noCommit || options.dryRun) return;

  runInherit('git', ['add', '.'], options);
  runInherit('git', ['commit', '-m', `chore: release v${version}`], options);
}

function runGitTag(options, version) {
  if (options.noCommit || options.noTag || options.dryRun) return;

  const tagMessage = options.message || `Version ${version}`;
  runInherit('git', ['tag', '-a', `v${version}`, '-m', tagMessage], options);
}

function runPromotionCommit(options, message) {
  if (options.noCommit || options.dryRun) return;

  runInherit('git', ['add', '.'], options);
  runInherit('git', ['commit', '-m', message], options);
}

function getOpenPromotionPullRequest(options) {
  const output = runAndRead(
    'gh',
    ['pr', 'list', '--repo', 'hashpass-tech/hashpass.tech', '--base', 'main', '--head', 'develop', '--state', 'open', '--json', 'number,title,url'],
    { ...options, log: false },
  );

  if (!output) {
    return null;
  }

  try {
    const prs = JSON.parse(output);
    return Array.isArray(prs) && prs.length > 0 ? prs[0] : null;
  } catch (_error) {
    return null;
  }
}

function buildPromotionPullRequestBody(releaseVersion, releaseSha) {
  return [
    `Promote the current develop release prep for v${releaseVersion} into main.`,
    '',
    'Merge requirements:',
    '- `@edcalderon` code owner approval',
    '- Coverage must stay at or above 33%',
    '- GitHub security scans (CodeQL and secret-scan) must pass',
    '',
    `Release commit: ${releaseSha}`,
    releaseVersion ? `Release version: v${releaseVersion}` : 'Release version: pending main release',
    '',
    'This PR must stay on the develop -> main path. Do not rebase from a feature branch or a stale branch.',
  ].join('\n');
}

function createPromotionPullRequest(options, releaseVersion, releaseSha) {
  if (!options.promote) return;

  if (releaseVersion && typeof releaseVersion !== 'string') {
    throw new Error('Invalid release version for promotion PR creation.');
  }

  const existingPr = getOpenPromotionPullRequest(options);
  if (existingPr) {
    console.log(`ℹ️ Promotion PR already open: ${existingPr.url}`);
    return existingPr;
  }

  if (options.dryRun) {
    console.log(
      '$ gh pr create --repo hashpass-tech/hashpass.tech --base main --head develop --title "chore: release v' +
        releaseVersion +
        '" --body "<promotion-body>"',
    );
    return { url: '' };
  }

  const body = buildPromotionPullRequestBody(releaseVersion, releaseSha);
  const prUrl = runAndRead(
    'gh',
    [
      'pr',
      'create',
      '--repo',
      'hashpass-tech/hashpass.tech',
      '--base',
      'main',
      '--head',
      'develop',
      '--title',
      `chore: release v${releaseVersion}`,
      '--body',
      body,
    ],
    options,
  );

  const url = prUrl.trim();
  console.log(`✅ Created promotion PR: ${url}`);
  return { url };
}

function main() {
  let initialBranch = '';
  let currentBranch = '';
  let stashApplied = false;

  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    initialBranch = getCurrentBranch();
    const branch = options.branch || initialBranch;
    const releaseBranch = branch.trim();

    ensureCleanGitState(options);

    if (releaseBranch !== initialBranch && !isCleanTree()) {
      stashApplied = stashDirtyWorktree(options);
    }

    currentBranch = initialBranch;

    if (releaseBranch !== initialBranch) {
      switchBranch(releaseBranch, options);
    currentBranch = releaseBranch;
  }

    console.log('');
    console.log('Release plan');
    console.log(`  Branch:    ${releaseBranch}`);
    console.log(`  Bump:      ${options.bump}`);
    console.log(`  Promote:   ${options.promote ? 'yes' : 'no'}`);
    console.log(`  Push:      ${options.push ? 'yes' : 'no'}`);
    console.log(`  Dry run:   ${options.dryRun ? 'yes' : 'no'}`);
    console.log('');

    runPreflight(options);
    let releaseVersion = '';
    if (options.promote && releaseBranch === 'develop') {
      releaseVersion = readJsonVersion('package.json');
      runPromotionCommit(options, `chore: promote develop changes for v${releaseVersion}`);
    } else if (releaseBranch === 'main') {
      releaseVersion = runMainRelease(options, releaseBranch);
    } else {
      runRelease(options, releaseBranch);
      releaseVersion = readJsonVersion('package.json');
    }

    if (releaseBranch === 'main') {
      runGitCommit(options, releaseVersion);
      runGitTag(options, releaseVersion);
    }

    const releaseSha = runAndRead('git', ['rev-parse', 'HEAD'], { log: false, dryRun: options.dryRun });
    const releaseTag = getExactTagForHead(options);

    if (!options.noCommit) {
      runGitPush(options, releaseBranch);
    }

    let promotionPr = null;
    if (options.promote) {
      if (releaseBranch !== 'develop') {
        throw new Error('--promote is only supported when releasing from develop.');
      }

      if (options.noCommit) {
        throw new Error('--promote requires a committed release. Drop --no-commit.');
      }

      promotionPr = createPromotionPullRequest(options, releaseVersion, releaseSha);
    }

    if (currentBranch !== initialBranch) {
      switchBranch(initialBranch, options);
      currentBranch = initialBranch;
    }

    if (stashApplied) {
      restoreDirtyWorktree(options);
      stashApplied = false;
    }

    console.log('');
    console.log('Release completed successfully.');
    console.log(`  Branch: ${releaseBranch}`);
    if (releaseTag) console.log(`  Tag:    ${releaseTag}`);
    console.log(`  SHA:    ${releaseSha}`);
    if (promotionPr?.url) {
      console.log(`  Promotion PR: ${promotionPr.url}`);
    }
  } catch (error) {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    try {
      if (currentBranch && initialBranch && currentBranch !== initialBranch) {
        switchBranch(initialBranch, { dryRun: false });
      }
    } catch (_error) {
      // best effort restore; the main error is reported above
    }

    try {
      if (stashApplied) {
        restoreDirtyWorktree({ allowDirty: true, dryRun: false });
      }
    } catch (_error) {
      // best effort restore; the main error is reported above
    }
  }
}

main();
