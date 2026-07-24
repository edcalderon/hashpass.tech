#!/usr/bin/env node

/**
 * Branch-aware release orchestrator for HASHPASS.
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

function hasStagedChanges() {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'pipe',
  });

  return result.status !== 0;
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

function parseSemverParts(version) {
  const normalized = String(version).trim().replace(/^v/, '');
  const parts = normalized.split('.').map((part) => Number(part));

  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
    throw new Error(`Invalid semantic version: ${version}`);
  }

  return parts;
}

function compareSemverVersions(left, right) {
  const leftParts = parseSemverParts(left);
  const rightParts = parseSemverParts(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}

function incrementPatchVersion(version) {
  const [major, minor, patch] = parseSemverParts(version);
  return `${major}.${minor}.${patch + 1}`;
}

function getLatestReleaseTagVersion(tagPrefix = 'v') {
  const output = runAndRead('git', ['tag', '--list', `${tagPrefix}*`, '--sort=-v:refname'], { log: false });
  const latestTag = output
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  if (!latestTag) {
    return null;
  }

  return latestTag.startsWith(tagPrefix) ? latestTag.slice(tagPrefix.length) : latestTag;
}

function hasLatestReleaseCommit(latestReleaseTag) {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', latestReleaseTag, 'HEAD'], {
    cwd: ROOT_DIR,
    env: process.env,
    stdio: 'pipe',
  });

  return result.status === 0;
}

function ensureBranchIsSyncedWithLatestRelease(options, branch) {
  if (branch !== 'main' && branch !== 'develop') return;

  const currentVersion = readJsonVersion('package.json');
  const latestReleaseVersion = getLatestReleaseTagVersion();

  if (!latestReleaseVersion) {
    return;
  }

  const latestReleaseTag = `v${latestReleaseVersion}`;
  const versionComparison = compareSemverVersions(currentVersion, latestReleaseVersion);

  if (versionComparison < 0) {
    const syncHint =
      branch === 'develop'
        ? 'Merge or pull main into develop before releasing.'
        : 'Pull the latest main release into your main checkout before releasing.';

    throw new Error(
      `Current ${branch} checkout is behind the latest release tag (${latestReleaseTag}). ` +
        `package.json is ${currentVersion} but production has ${latestReleaseVersion}. ${syncHint}`
    );
  }

  if (!hasLatestReleaseCommit(latestReleaseTag)) {
    const syncHint =
      branch === 'develop'
        ? 'Merge the latest main release commit into develop before releasing.'
        : 'Pull the latest release commit into main before releasing.';

    throw new Error(
      `Current ${branch} checkout does not contain the latest release tag (${latestReleaseTag}). ` +
        `${syncHint}`
    );
  }
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
    skipVersionBump: false,
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

    if (arg === '--skip-version-bump') {
      options.skipVersionBump = true;
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
      '  --skip-version-bump       On --promote, skip the version/changelog bump (old predict-only behavior)',
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

  let versioningError = null;
  try {
    runInherit(VERSIONING_BIN, ['exec', 'versioning', ...buildVersioningArgs(mainOptions, branch)], options);
  } catch (error) {
    versioningError = error;
  }

  const releaseVersion = readJsonVersion('package.json');

  if (versioningError && !hasEmptyChangelogEntry(releaseVersion)) {
    throw versioningError;
  }

  if (versioningError) {
    console.warn(
      `⚠️  Recovering the empty v${releaseVersion} changelog entry generated before versioning validation.`,
    );
  }

  runInherit('node', [
    'packages/tools/scripts/update-version.mjs',
    releaseVersion,
    '--type=stable',
    '--skip-git-info',
  ], options);

  syncJsonVersion('apps/mobile-app/config/version.production.json', releaseVersion);
  syncJsonVersion('apps/mobile-app/config/version.development.json', releaseVersion);

  if (versioningError) {
    runInherit(
      VERSIONING_BIN,
      ['exec', 'versioning', 'check-changelog', '--config', options.config, '--version', releaseVersion],
      options,
    );
  }

  return releaseVersion;
}

function hasEmptyChangelogEntry(version) {
  const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) return false;

  const heading = `## [${String(version).trim().replace(/^v/, '')}]`;
  const content = fs.readFileSync(changelogPath, 'utf8');
  const start = content.indexOf(heading);
  if (start === -1) return false;

  const end = content.indexOf('\n## ', start + heading.length);
  const entry = content.slice(start, end === -1 ? content.length : end);
  return !/^\s*(?:[-*+]|\d+\.)\s+\S/m.test(entry);
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
  if (!hasStagedChanges()) {
    console.log('No promotion file changes to commit; using the current HEAD for the promotion PR.');
    return;
  }

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

function getCurrentGitHubLogin(options) {
  try {
    const login = runAndRead('gh', ['api', 'user', '--jq', '.login'], { ...options, log: false });
    return login.trim();
  } catch (_error) {
    return '';
  }
}

function resolvePromotionVersion(currentVersion, latestReleaseVersion) {
  const normalizedCurrent = String(currentVersion || '').trim().replace(/^v/, '');
  const normalizedLatest = String(latestReleaseVersion || '').trim().replace(/^v/, '');

  if (!normalizedCurrent) {
    throw new Error('Unable to determine the current release version for promotion.');
  }

  if (!normalizedLatest) {
    return normalizedCurrent;
  }

  if (compareSemverVersions(normalizedCurrent, normalizedLatest) > 0) {
    return normalizedCurrent;
  }

  return incrementPatchVersion(normalizedLatest);
}

function normalizeReleaseText(value) {
  return String(value || '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeJsStringLiteralValue(rawValue) {
  let decoded = '';

  for (let index = 0; index < rawValue.length; index += 1) {
    const char = rawValue[index];
    if (char !== '\\') {
      decoded += char;
      continue;
    }

    index += 1;
    if (index >= rawValue.length) {
      decoded += '\\';
      break;
    }

    const escaped = rawValue[index];
    switch (escaped) {
      case '\\':
      case "'":
      case '"':
        decoded += escaped;
        break;
      case 'n':
        decoded += '\n';
        break;
      case 'r':
        decoded += '\r';
        break;
      case 't':
        decoded += '\t';
        break;
      case 'b':
        decoded += '\b';
        break;
      case 'f':
        decoded += '\f';
        break;
      case 'v':
        decoded += '\v';
        break;
      case '0':
        decoded += '\0';
        break;
      default:
        decoded += `\\${escaped}`;
    }
  }

  return decoded;
}

function extractArrayLiteralBody(block, key) {
  const content = String(block || '');
  const keyMatch = new RegExp(`${key}:\\s*\\[`).exec(content);
  if (!keyMatch) return '';

  const start = keyMatch.index + keyMatch[0].length;
  let depth = 1;
  let quote = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (char === '\\') {
        index += 1;
        continue;
      }
      if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === '[') {
      depth += 1;
      continue;
    }

    if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(start, index);
      }
    }
  }

  return '';
}

function extractQuotedStringValues(value) {
  const content = String(value || '');
  const values = [];
  let quote = '';
  let rawValue = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote) {
      if (char === '/' && next === '/') {
        inLineComment = true;
        index += 1;
        continue;
      }

      if (char === '/' && next === '*') {
        inBlockComment = true;
        index += 1;
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        rawValue = '';
      }
      continue;
    }

    if (char === '\\') {
      rawValue += char;
      if (index + 1 < content.length) {
        index += 1;
        rawValue += content[index];
      }
      continue;
    }

    if (char === quote) {
      values.push(decodeJsStringLiteralValue(rawValue).trim());
      quote = '';
      rawValue = '';
      continue;
    }

    rawValue += char;
  }

  return values;
}

function extractVersionArray(block, key) {
  const body = extractArrayLiteralBody(block, key);
  if (!body) return [];

  return extractQuotedStringValues(body)
    .map((line) => normalizeReleaseText(line))
    .filter(Boolean);
}

function extractVersionString(block, key) {
  const match = String(block || '').match(new RegExp(`${key}:\\s*(['"])(.*)\\1,`));
  if (!match) return '';

  return normalizeReleaseText(match[2].replace(/\\(['"])/g, '$1'));
}

function readPromotionVersionInfo() {
  const versionPath = path.join(ROOT_DIR, 'apps/mobile-app/config/version.ts');
  if (!fs.existsSync(versionPath)) {
    return null;
  }

  const content = fs.readFileSync(versionPath, 'utf8');
  const currentVersionMatch = content.match(/export const CURRENT_VERSION: VersionInfo = \{([\s\S]*?)\n\};/);

  if (!currentVersionMatch) {
    return null;
  }

  const block = currentVersionMatch[1];
  return {
    notes: extractVersionString(block, 'notes'),
    features: extractVersionArray(block, 'features'),
    bugfixes: extractVersionArray(block, 'bugfixes'),
    breakingChanges: extractVersionArray(block, 'breakingChanges'),
  };
}

function formatPromotionSummarySections(versionInfo) {
  if (!versionInfo) return '';

  const sections = [];
  const notes = normalizeReleaseText(versionInfo.notes);
  const releaseNotesPattern = /^Version\s+\d+\.\d+\.\d+\s+release$/i;

  if (notes && !releaseNotesPattern.test(notes)) {
    sections.push(`#### Overview\n- ${notes}`);
  }

  const orderedSections = [
    ['Features', versionInfo.features],
    ['Bug Fixes', versionInfo.bugfixes],
    ['Breaking Changes', versionInfo.breakingChanges],
  ];

  for (const [title, items] of orderedSections) {
    if (!Array.isArray(items) || items.length === 0) {
      continue;
    }

    sections.push(
      `#### ${title}\n${items.map((item) => `- ${normalizeReleaseText(item)}`).join('\n')}`,
    );
  }

  return sections.join('\n\n').trim();
}

function buildPromotionFileDetails(baseReleaseVersion) {
  const files = getPromotionChangedFiles(baseReleaseVersion);

  if (files.length === 0) {
    const normalizedBase = String(baseReleaseVersion || '').trim().replace(/^v/, '');
    return normalizedBase ? `_No file changes were detected since v${normalizedBase}._` : '';
  }

  const maxItems = 20;
  const visibleFiles = files.slice(0, maxItems).map((file) => `- \`${file}\``);
  const remaining = files.length - visibleFiles.length;

  if (remaining > 0) {
    visibleFiles.push(`- _and ${remaining} more file(s)_`);
  }

  return [
    '<details>',
    `<summary>Changed files (${files.length})</summary>`,
    '',
    ...visibleFiles,
    '',
    '</details>',
  ].join('\n');
}

function getPromotionChangedFiles(baseReleaseVersion) {
  const normalizedBase = String(baseReleaseVersion || '').trim().replace(/^v/, '');
  if (!normalizedBase) {
    return [];
  }

  const output = runAndRead(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRTUXB', `v${normalizedBase}..HEAD`],
    { log: false },
  );

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildPromotionFileHighlights(files) {
  const normalizedFiles = Array.isArray(files)
    ? files.map((file) => String(file || '').trim()).filter(Boolean)
    : [];

  if (normalizedFiles.length === 0) {
    return '';
  }

  const bullets = [];
  const hasFile = (matchers) => normalizedFiles.some((file) => matchers.some((matcher) => matcher(file)));

  const docsMatchers = [
    (file) => file === 'CLAUDE.md',
    (file) => file === 'README.md',
    (file) => file === 'packages/tools/scripts/README.md',
    (file) => file === 'apps/docs/docs/reference/release/RELEASE_WORKFLOW.md',
    (file) => file.startsWith('apps/docs/docs/'),
  ];
  if (hasFile(docsMatchers)) {
    bullets.push(
      'Updated release docs and CLAUDE guidance so the protected promotion flow now describes the readable PR body and release path instead of a raw checklist.',
    );
  }

  const releaseToolingMatchers = [
    (file) => file === 'packages/tools/scripts/release.js',
    (file) => file === 'packages/tools/scripts/release.test.js',
  ];
  if (hasFile(releaseToolingMatchers)) {
    bullets.push(
      'Reworked the promotion PR generator and its coverage so release notes, bug fixes, and file details are rendered in a changelog-style summary.',
    );
  }

  const syncMatchers = [
    (file) => file === 'packages/tools/scripts/update-version.mjs',
    (file) => file === 'packages/tools/scripts/update-readme.mjs',
    (file) => file === 'packages/tools/scripts/check-readme-sync.mjs',
    (file) => file === 'CHANGELOG.md',
  ];
  if (hasFile(syncMatchers)) {
    bullets.push(
      'Kept versioning, changelog, and README sync aligned with the release patch workflow.',
    );
  }

  const mobileMatchers = [
    (file) => file.startsWith('apps/mobile-app/'),
  ];
  if (hasFile(mobileMatchers)) {
    bullets.push('Synced mobile app release metadata, version history, and runtime behavior changes.');
  }

  const workflowMatchers = [
    (file) => file.startsWith('.github/workflows/'),
    (file) => file.startsWith('.github/scripts/'),
    (file) => file.startsWith('packages/infra/'),
  ];
  if (hasFile(workflowMatchers)) {
    bullets.push(
      'Adjusted workflow and release automation to keep the protected develop -> main path consistent.',
    );
  }

  return bullets.length > 0
    ? [`#### Implementation changes`, bullets.map((bullet) => `- ${bullet}`).join('\n')].join('\n')
    : '';
}

function buildPromotionChangeSummary(baseReleaseVersion, releaseVersion) {
  const releaseInfo = readPromotionVersionInfo();
  const summary = formatPromotionSummarySections(releaseInfo);
  const files = getPromotionChangedFiles(baseReleaseVersion);
  const fileHighlights = buildPromotionFileHighlights(files);
  const fileDetails = buildPromotionFileDetails(baseReleaseVersion);

  const blocks = [summary, fileHighlights, fileDetails].filter(Boolean);

  if (blocks.length > 0) {
    return blocks.join('\n\n');
  }

  return fileDetails || '_No change summary is available._';
}

function buildPromotionPullRequestBody(releaseVersion, releaseSha, changeSummary, baseReleaseVersion) {
  const normalizedVersion = String(releaseVersion || '').trim().replace(/^v/, '');
  const versionLabel = normalizedVersion ? `v${normalizedVersion}` : 'pending version';
  const normalizedBaseVersion = String(baseReleaseVersion || '').trim().replace(/^v/, '');
  const changeBlock =
    typeof changeSummary === 'string' && changeSummary.trim().length > 0
      ? changeSummary.trim()
      : '_No change summary is available._';

  return [
    `Promote the current develop release prep for ${versionLabel} into main.`,
    '',
    normalizedBaseVersion
      ? `### Changes since v${normalizedBaseVersion}`
      : '### Changes in this release',
    changeBlock,
    '',
    '### Release metadata',
    `- Release version: ${versionLabel}`,
    normalizedBaseVersion ? `- Base release: v${normalizedBaseVersion}` : '- Base release: unknown',
    releaseSha ? `- Release commit: ${releaseSha}` : '- Release commit: pending',
    '- Source branch: develop',
    '',
    'This PR must stay on the protected develop -> main path. Repository rules enforce the required reviews, coverage, and security checks.',
  ].join('\n');
}

function createPromotionPullRequest(options, releaseVersion, releaseSha, baseReleaseVersion) {
  if (!options.promote) return;

  if (releaseVersion && typeof releaseVersion !== 'string') {
    throw new Error('Invalid release version for promotion PR creation.');
  }

  const body = buildPromotionPullRequestBody(
    releaseVersion,
    releaseSha,
    buildPromotionChangeSummary(baseReleaseVersion, releaseVersion),
    baseReleaseVersion,
  );
  const currentLogin = getCurrentGitHubLogin(options);
  const reviewers = currentLogin && currentLogin === 'edcalderon' ? [] : ['edcalderon'];
  const reviewerArgs = reviewers.flatMap((reviewer) => ['--add-reviewer', reviewer]);
  const title = `chore: release v${releaseVersion}`;
  const existingPr = getOpenPromotionPullRequest(options);
  if (existingPr) {
    if (options.dryRun) {
      console.log(
        `$ gh pr edit ${existingPr.number} --repo hashpass-tech/hashpass.tech --title "${title}" --body "<promotion-body>"`,
      );
      return { url: existingPr.url };
    }

    runInherit(
      'gh',
      [
        'pr',
        'edit',
        String(existingPr.number),
        '--repo',
        'hashpass-tech/hashpass.tech',
        '--title',
        title,
        '--body',
        body,
        ...reviewerArgs,
      ],
      options,
    );

    console.log(`✅ Updated promotion PR: ${existingPr.url}`);
    return existingPr;
  }

  if (options.dryRun) {
    console.log(
      '$ gh pr create --repo hashpass-tech/hashpass.tech --base main --head develop --title "' +
        title +
        '" --body "<promotion-body>"',
    );
    return { url: '' };
  }

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
      title,
      '--body',
      body,
      ...reviewerArgs,
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
  let promotionBaseVersion = '';

  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printUsage();
      return;
    }

    initialBranch = getCurrentBranch();
    const branch = options.branch || initialBranch;
    const releaseBranch = branch.trim();

    ensureBranchIsSyncedWithLatestRelease(options, releaseBranch);
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
      const currentVersion = readJsonVersion('package.json');
      promotionBaseVersion = getLatestReleaseTagVersion() || currentVersion;
      const predictedVersion = resolvePromotionVersion(currentVersion, promotionBaseVersion);

      // Commit any unrelated dirty/untracked files first (rare — e.g. a
      // stray local config file) so the version bump below lands as its
      // own clean, separately-labeled commit and a reviewer can isolate it
      // from both the code diff and from incidental janitorial changes.
      runPromotionCommit(options, `chore: promote develop changes for v${predictedVersion}`);

      if (options.skipVersionBump) {
        releaseVersion = predictedVersion;
      } else {
        // The version bump + changelog now happen here, inside the
        // reviewed PR, instead of after merge on a separate main worktree.
        // main's branch-aware format rules apply regardless of which
        // branch this physically runs on (--target-branch is explicit),
        // verified empirically 2026-07-13. Reuse runMainRelease as-is:
        // it already does exactly this (versioning patch --no-commit
        // --no-tag, update-version.mjs, JSON syncs) — only the branch this
        // gets committed on differs. No tag here: tagging happens after
        // merge, on main's actual merge-commit SHA, once that CI job
        // exists (see .agents/active/task-release-flow-automation.md).
        releaseVersion = runMainRelease(options, 'main');
        runGitCommit(options, releaseVersion);
      }
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

      promotionPr = createPromotionPullRequest(
        options,
        releaseVersion,
        releaseSha,
        promotionBaseVersion,
      );
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

if (require.main === module) {
  main();
}

module.exports = {
  buildPromotionPullRequestBody,
  buildPromotionChangeSummary,
  buildPromotionFileHighlights,
  extractVersionArray,
  formatPromotionSummarySections,
  incrementPatchVersion,
  resolvePromotionVersion,
};
