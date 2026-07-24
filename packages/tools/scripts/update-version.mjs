#!/usr/bin/env node

/**
 * Version Update Script for BSL 2025 HashPass
 * Automatically updates version numbers across all configuration files
 * 
 * Usage:
 *   node scripts/update-version.mjs 1.1.9
 *   node scripts/update-version.mjs 1.2.0 --type=stable
 *   node scripts/update-version.mjs 1.1.10 --type=beta --notes="Bug fixes"
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..', '..');
const mobileAppRoot = path.join(projectRoot, 'apps', 'mobile-app');

const VERSION_TS_PATHS = [
  path.join(mobileAppRoot, 'config', 'version.ts'),
];

const VERSION_JSON_PATHS = [
  path.join(mobileAppRoot, 'config', 'version.production.json'),
  path.join(mobileAppRoot, 'config', 'version.development.json'),
];

const VERSIONS_JSON_TARGETS = [
  {
    versionTsPath: path.join(mobileAppRoot, 'config', 'version.ts'),
    versionsJsonPath: path.join(mobileAppRoot, 'config', 'versions.json'),
  },
];

const GIT_INFO_PATHS = [
  path.join(mobileAppRoot, 'config', 'git-info.json'),
];

// Escapes a string for safe interpolation into a single-quoted JS string
// literal written into version.ts. Backslashes MUST be escaped first — doing
// only `.replace(/'/g, "\\'")` (the previous approach everywhere below) is
// incomplete escaping: a source string ending in a backslash immediately
// before a quote (e.g. from a Windows path in a commit subject, `C:\foo\`)
// would have that backslash "consume" the following escaped quote, breaking
// out of the string literal early. Since this is git-log-derived content
// interpolated into generated source that then gets require()'d by the app,
// that's a real code-injection surface, not just a cosmetic bug (CodeQL
// js/incomplete-string-escaping flagged this).
function escapeJsStringLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
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

// Function to get current version from package.json
function getCurrentVersion() {
  const packageJsonPath = path.join(projectRoot, 'package.json');
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.error('❌ Error: Could not read package.json');
    process.exit(1);
  }
}

// Function to increment version
function incrementVersion(version, bumpType = 'patch') {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) {
    throw new Error('Invalid version format');
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

// Parse command line arguments
const args = process.argv.slice(2);

// Find version number (first argument that matches version format)
const versionRegex = /^\d+\.\d+\.\d+$/;
const versionIndex = args.findIndex(arg => versionRegex.test(arg));
const bumpTypeIndex = args.findIndex(arg => ['patch', 'minor', 'major'].includes(arg));

const releaseType = args.find(arg => arg.startsWith('--type='))?.split('=')[1] || 'beta';
const releaseNotes = args.find(arg => arg.startsWith('--notes='))?.split('=')[1] || '';
const commitMessageIndex = args.findIndex(arg => arg === '--commit-message');
const commitMessage = commitMessageIndex !== -1 && args[commitMessageIndex + 1]
  ? args[commitMessageIndex + 1]
  : (args.find(arg => arg.startsWith('--commit-message='))?.split('=')[1] || '');
const skipGitInfo = args.includes('--skip-git-info');

// Git operation flags (optional)
const shouldCommit = args.includes('--commit') || args.includes('-c');
const shouldTag = args.includes('--tag') || args.includes('-t');
const shouldPush = args.includes('--push') || args.includes('-p');
const autoGit = args.includes('--auto-git'); // Shorthand for --commit --tag --push

// Determine version
let newVersion;
// Tracked in every branch (not just the auto-increment ones) so it can anchor
// the `git log <fromVersion>..HEAD` range used to auto-derive release notes
// below — previously only computed inside the auto-increment branches, so an
// explicit-version invocation had no "previous version" to diff against.
const versionBeforeBump = getCurrentVersion();

if (versionIndex !== -1) {
  // Explicit version provided
  newVersion = args[versionIndex];
} else if (bumpTypeIndex !== -1) {
  // Bump type provided, auto-increment
  const bumpType = args[bumpTypeIndex];
  const currentVersion = getCurrentVersion();
  newVersion = incrementVersion(currentVersion, bumpType);
  console.log(`📦 Auto-detected current version: ${currentVersion}`);
  console.log(`⬆️  Bumping ${bumpType} version to: ${newVersion}`);
} else {
  // No version or bump type, default to patch increment
  const currentVersion = getCurrentVersion();
  newVersion = incrementVersion(currentVersion, 'patch');
  console.log(`📦 Auto-detected current version: ${currentVersion}`);
  console.log(`⬆️  Auto-incrementing patch version to: ${newVersion}`);
}

// Validate version format
if (!newVersion || !versionRegex.test(newVersion)) {
  console.error('❌ Error: Invalid version format');
  console.log('');
  console.log('Usage: node scripts/update-version.mjs [version] [options]');
  console.log('   or: npm run version:update [version] [-- --options]');
  console.log('   or: npm run version:bump [version|patch|minor|major]');
  console.log('');
  console.log('Options:');
  console.log('  <version>            Explicit version (e.g., 1.3.7) - optional');
  console.log('  patch|minor|major     Auto-increment version type - optional (default: patch)');
  console.log('  --type=<type>         Release type: alpha, beta, rc, stable (default: beta)');
  console.log('  --notes="<notes>"     Release notes');
  console.log('  --commit, -c          Commit changes automatically');
  console.log('  --tag, -t             Create git tag automatically');
  console.log('  --push, -p            Push to remote automatically');
  console.log('  --auto-git            Shorthand for --commit --tag --push');
  console.log('');
  console.log('Examples:');
  console.log('  npm run version:bump                    # Auto-increment patch (1.6.1 -> 1.6.2)');
  console.log('  npm run version:bump patch               # Auto-increment patch');
  console.log('  npm run version:bump minor               # Auto-increment minor (1.6.1 -> 1.7.0)');
  console.log('  npm run version:bump major               # Auto-increment major (1.6.1 -> 2.0.0)');
  console.log('  npm run version:bump 1.3.7               # Explicit version');
  console.log('  npm run version:bump --type=stable       # Auto-increment with release type');
  process.exit(1);
}

// Validate release type
const validTypes = ['alpha', 'beta', 'rc', 'stable'];
if (!validTypes.includes(releaseType)) {
  console.error(`❌ Error: Release type must be one of: ${validTypes.join(', ')}`);
  process.exit(1);
}

console.log(`🚀 Updating version to ${newVersion} (${releaseType})`);
if (autoGit || shouldCommit || shouldTag || shouldPush) {
  console.log(`📋 Git operations: ${autoGit || shouldCommit ? 'commit' : ''} ${autoGit || shouldTag ? 'tag' : ''} ${autoGit || shouldPush ? 'push' : ''}`);
}

// Generate build number (timestamp-based)
const buildNumber = parseInt(new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12));
const releaseDate = new Date().toISOString().split('T')[0];

// Android version code — derived from semver so it's deterministic and always
// increases with every release. Formula: major*10000 + minor*100 + patch.
// Range: up to ~2M for v2.0.0, well within Android's 2.1B limit.
const [vMajor, vMinor, vPatch] = newVersion.split('.').map(Number);
const androidVersionCode = vMajor * 10000 + vMinor * 100 + vPatch;

// Real release content for THIS version, derived from git history below
// (function is hoisted — defined further down, called here before that
// definition's source position, which is fine for a `function` declaration).
const gitDerivedSummary = deriveReleaseSummaryFromGit(versionBeforeBump, newVersion);
if (gitDerivedSummary.features.length || gitDerivedSummary.bugfixes.length || gitDerivedSummary.breakingChanges.length) {
  console.log(`📝 Auto-derived release summary from git log v${versionBeforeBump}..HEAD:`, {
    features: gitDerivedSummary.features.length,
    bugfixes: gitDerivedSummary.bugfixes.length,
    breakingChanges: gitDerivedSummary.breakingChanges.length,
  });
} else {
  console.warn(`⚠️  No conventional-commit feat:/fix: subjects found since v${versionBeforeBump} — features/bugfixes will be empty rather than stale`);
}

// Auto-derive a release summary from conventional-commit messages since the
// last release tag, so CURRENT_VERSION.features/bugfixes/breakingChanges/notes
// and the CHANGELOG.md entry reflect what actually changed in THIS release.
// Previously these fields only ever got set from a manual --notes= flag that
// nobody has been passing in practice, so version.ts's CURRENT_VERSION.bugfixes
// silently carried forward whatever a human typed in once, unchanged, across
// every subsequent automated release — including releases (like this one) that
// never touched the thing the stale bullets described.
function deriveReleaseSummaryFromGit(fromVersion, currentNewVersion) {
  const empty = { features: [], bugfixes: [], breakingChanges: [], notes: '' };

  let fromRef = null;
  // release.js's runMainRelease bumps package.json's version via the
  // `versioning` tool BEFORE invoking this script with the new version as an
  // explicit argument, so getCurrentVersion() here already reads the
  // post-bump value — fromVersion (aka versionBeforeBump) ends up equal to
  // currentNewVersion, and no `v${fromVersion}` tag exists yet to diff
  // against. Skip the direct lookup in that case and fall through to the
  // nearest-reachable-tag fallback below instead of silently returning empty.
  if (fromVersion && fromVersion !== currentNewVersion) {
    for (const candidate of [`v${fromVersion}`, fromVersion]) {
      try {
        execSync(`git rev-parse --verify ${candidate}`, { cwd: projectRoot, stdio: 'ignore' });
        fromRef = candidate;
        break;
      } catch {
        // try the next candidate tag form
      }
    }
  }
  if (!fromRef) {
    try {
      const nearestTag = execSync('git describe --tags --abbrev=0 --match "v*"', {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (nearestTag && nearestTag !== `v${currentNewVersion}`) {
        fromRef = nearestTag;
      }
    } catch {
      // no reachable tag at all (e.g. shallow clone or first-ever release)
    }
  }
  if (!fromRef) {
    console.warn(`⚠️  No previous release tag found to diff against (tried v${fromVersion}) — skipping auto-derived release notes`);
    return empty;
  }

  let log;
  try {
    log = execSync(`git log ${fromRef}..HEAD --no-merges --pretty=format:%s`, {
      cwd: projectRoot,
      encoding: 'utf8',
    });
  } catch (error) {
    console.warn(`⚠️  Could not read git log for ${fromRef}..HEAD: ${error.message}`);
    return empty;
  }

  const features = [];
  const bugfixes = [];
  const breakingChanges = [];
  const seen = new Set();

  for (const rawSubject of log.split('\n')) {
    const subject = rawSubject.trim();
    if (!subject) continue;
    // The release tooling's own bookkeeping commits aren't user-facing changes.
    if (/^chore\(release\)|^chore:\s*release\b/i.test(subject)) continue;

    const match = subject.match(/^(?:[^\p{L}\p{N}_\s]+\s*)?(\w+)(\([^)]*\))?(!)?:\s*(.+)$/u);
    if (!match) continue; // not conventional-commit shaped — skip rather than guess wrong

    const [, type, , breakingMarker, description] = match;
    const cleaned = description.trim();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);

    if (breakingMarker) {
      breakingChanges.push(cleaned);
    } else if (type === 'feat') {
      features.push(cleaned);
    } else if (type === 'fix') {
      bugfixes.push(cleaned);
    }
  }

  const highlights = [...features, ...bugfixes, ...breakingChanges].slice(0, 3);
  const notes = highlights.length ? highlights.join('; ') : '';

  return { features, bugfixes, breakingChanges, notes };
}

// Rewrite CURRENT_VERSION's features/bugfixes/breakingChanges arrays in place
// with this release's gitDerivedSummary. VERSION_HISTORY entries are built
// separately (also from gitDerivedSummary, see the "Update version history"
// section below) since that array is keyed per-version and this function only
// ever targets the single CURRENT_VERSION block — isolating that block first
// so this can never accidentally match a VERSION_HISTORY entry that happens to
// contain the same field names.
function applyCurrentVersionArrays(content, { features, bugfixes, breakingChanges }) {
  const blockMatch = content.match(/export const CURRENT_VERSION: VersionInfo = \{[\s\S]*?\n\};/);
  if (!blockMatch) {
    console.warn('⚠️  Could not find CURRENT_VERSION block to update features/bugfixes/breakingChanges');
    return content;
  }

  const formatArray = (items, emptyComment) =>
    items.length > 0
      ? items.map((item) => `    '${escapeJsStringLiteral(item)}'`).join(',\n')
      : `    ${emptyComment}`;

  let block = blockMatch[0];
  block = block.replace(
    /features:\s*\[[\s\S]*?\],/,
    `features: [\n${formatArray(features, '// No new features')}\n  ],`
  );
  block = block.replace(
    /bugfixes:\s*\[[\s\S]*?\],/,
    `bugfixes: [\n${formatArray(bugfixes, '// No bugfixes')}\n  ],`
  );
  block = block.replace(
    /breakingChanges:\s*\[[\s\S]*?\],/,
    `breakingChanges: [${breakingChanges.length > 0 ? `\n${formatArray(breakingChanges, '')}\n  ` : ''}],`
  );

  return content.replace(blockMatch[0], block);
}

// Function to update the CHANGELOG.md file
function updateChangelog(version, releaseType, notes = '') {
  const changelogPath = path.join(projectRoot, 'CHANGELOG.md');
  if (!fs.existsSync(changelogPath)) {
    console.log('ℹ️ CHANGELOG.md not found, creating a new one');
    const initialContent = `# Changelog\n\nAll notable changes to the BSL 2025 HashPass application will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n## [${version}] - ${releaseDate}\n\n### ${releaseType === 'stable' ? 'Released' : releaseType.charAt(0).toUpperCase() + releaseType.slice(1)}\n- ${notes || `Version ${version} release`}\n\n### Technical Details\n- Version: ${version}\n- Release Type: ${releaseType}\n- Build Number: ${buildNumber}\n- Release Date: ${new Date().toISOString()}\n`;
    fs.writeFileSync(changelogPath, initialContent);
    return;
  }

  let content = fs.readFileSync(changelogPath, 'utf8');

  // versioning writes its heading before it checks that conventional commits
  // produced any changelog bullets. When all subjects use a supported emoji
  // prefix (for example, "🐛 fix:"), that check can stop the release with an
  // otherwise-empty heading. Fill that specific entry here so the project
  // release script can recover without hand-editing release artifacts.
  const versionHeading = `## [${version}]`;
  const existingEntryStart = content.indexOf(versionHeading);
  if (existingEntryStart !== -1) {
    const followingEntryStart = content.indexOf('\n## ', existingEntryStart + versionHeading.length);
    const existingEntryEnd = followingEntryStart === -1 ? content.length : followingEntryStart;
    const existingEntry = content.slice(existingEntryStart, existingEntryEnd);
    const hasDocumentedChanges = /^\s*(?:[-*+]|\d+\.)\s+\S/m.test(existingEntry);

    if (hasDocumentedChanges) {
      console.log(`ℹ️ Version ${version} already exists in CHANGELOG.md, skipping update`);
      return;
    }

    const documentedChanges = `\n### ${releaseType === 'stable' ? 'Released' : releaseType.charAt(0).toUpperCase() + releaseType.slice(1)}\n- ${notes || `Version ${version} release`}\n`;
    content = content.slice(0, existingEntryEnd).trimEnd() + documentedChanges + content.slice(existingEntryEnd);
    fs.writeFileSync(changelogPath, content);
    console.log(`✅ Filled empty CHANGELOG.md entry for version ${version}`);
    return;
  }

  // Add the new version at the top of the changelog
  const today = new Date().toISOString().split('T')[0];
  const newEntry = `## [${version}] - ${today}\n\n### ${releaseType === 'stable' ? 'Released' : releaseType.charAt(0).toUpperCase() + releaseType.slice(1)}\n- ${notes || `Version ${version} release`}\n\n### Technical Details\n- Version: ${version}\n- Release Type: ${releaseType}\n- Build Number: ${buildNumber}\n- Release Date: ${new Date().toISOString()}\n\n`;

  // Insert the new version after the changelog header
  const headerEnd = content.indexOf('\n## [');
  if (headerEnd !== -1) {
    content = content.slice(0, headerEnd) + '\n' + newEntry + content.slice(headerEnd);
  } else {
    content = newEntry + '\n' + content;
  }

  fs.writeFileSync(changelogPath, content);
  console.log(`✅ Updated CHANGELOG.md with version ${version}`);
}

function syncReadmeFromChangelog() {
  const readmeSyncScript = 'pnpm run update-readme';
  console.log('📘 Syncing README.md from CHANGELOG.md...');

  execSync(readmeSyncScript, {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  console.log('✅ Synced README.md from CHANGELOG.md');
}

// Files to update
const filesToUpdate = [
  {
    path: 'package.json',
    updates: [
      {
        key: 'version',
        value: newVersion
      }
    ]
  },
  {
    path: 'apps/mobile-app/package.json',
    updates: [
      {
        key: 'version',
        value: newVersion
      }
    ]
  },
  {
    path: 'packages/infra/lambda/package.json',
    updates: [
      {
        key: 'version',
        value: newVersion
      }
    ]
  },
  ...(fs.existsSync(path.join(projectRoot, 'app.json')) ? [{
    path: 'app.json',
    updates: [
      {
        key: 'expo.version',
        value: newVersion
      }
    ]
  }] : []),
  ...['apps/mobile-app/config/version.ts'].map((targetPath) => ({
    path: targetPath,
    updates: [
      {
        key: 'buildNumber',
        value: buildNumber,
        pattern: /buildNumber:\s*\d+,/
      },
      {
        key: 'releaseDate',
        value: `'${releaseDate}'`,
        pattern: /releaseDate:\s*'[^']*',/
      },
      {
        key: 'releaseType',
        value: `'${releaseType}'`,
        pattern: /releaseType:\s*'[^']*',/
      },
      {
        key: 'notes',
        value: `'${escapeJsStringLiteral(releaseNotes || gitDerivedSummary.notes || `Version ${newVersion} release`)}'`,
        // The previous release's notes value can itself contain escaped
        // quotes (e.g. "CodeQL\'s"), which a naive [^']* stops at
        // prematurely — it treats the character right after the backslash
        // as the closing quote, truncating the match and leaving a
        // fragment of the old string behind after replacement. Match
        // escaped-char-or-non-quote instead, so it only stops at a truly
        // unescaped closing quote.
        pattern: /notes:\s*'(?:[^'\\]|\\.)*'/
      }
    ]
  })),
  ...(fs.existsSync(path.join(projectRoot, 'apps/mobile-app/app.json')) ? [{
    path: 'apps/mobile-app/app.json',
    updates: [
      {
        key: 'expo.version',
        value: newVersion
      },
      {
        key: 'expo.android.versionCode',
        value: androidVersionCode
      }
    ]
  }] : []),
  ...VERSION_JSON_PATHS.map((targetPath) => ({
    path: path.relative(projectRoot, targetPath),
    updates: [
      {
        key: 'version',
        value: newVersion
      }
    ]
  }))
];

// Update files
let allUpdated = true;

for (const file of filesToUpdate) {
  const filePath = path.join(projectRoot, file.path);

  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Warning: File ${file.path} not found, skipping...`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let fileUpdated = false;

    for (const update of file.updates) {
      const keys = update.key.split('.');
      let updated = false;

      if (update.pattern) {
        // Use custom pattern for version.ts file
        if (update.pattern.test(content)) {
          if (update.key === 'buildNumber') {
            content = content.replace(update.pattern, `buildNumber: ${update.value},`);
          } else if (update.key === 'notes') {
            content = content.replace(update.pattern, `${update.key}: ${update.value}`);
          } else {
            content = content.replace(update.pattern, `${update.key}: ${update.value},`);
          }
          updated = true;
        }
      } else if (keys.length === 1) {
        // Simple key update
        const regex = new RegExp(`("${keys[0]}"\\s*:\\s*)"[^"]*"`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, `$1"${update.value}"`);
          updated = true;
        }
      } else if (keys.length === 2) {
        // Nested key update (like expo.version)
        const regex = new RegExp(`("${keys[0]}"\\s*:\\s*{[^}]*"${keys[1]}"\\s*:\\s*)"[^"]*"`, 'g');
        if (regex.test(content)) {
          content = content.replace(regex, `$1"${update.value}"`);
          updated = true;
        }
      } else if (keys.length >= 3 && file.path.endsWith('app.json')) {
        // Deep path in app.json — use JSON parse/stringify to set or create the field.
        try {
          const json = JSON.parse(content);
          let node = json;
          for (let i = 0; i < keys.length - 1; i++) {
            if (node[keys[i]] == null || typeof node[keys[i]] !== 'object') {
              node[keys[i]] = {};
            }
            node = node[keys[i]];
          }
          node[keys[keys.length - 1]] = update.value;
          content = JSON.stringify(json, null, 2) + '\n';
          updated = true;
        } catch {
          // fall through — updated stays false
        }
      }

      if (updated) {
        fileUpdated = true;
        console.log(`✅ Updated ${file.path}: ${update.key} = ${update.value}`);
      } else {
        console.warn(`⚠️  Could not find ${update.key} in ${file.path}`);
      }
    }

    if (file.path === 'apps/mobile-app/config/version.ts') {
      content = applyCurrentVersionArrays(content, gitDerivedSummary);
      fileUpdated = true;
    }

    if (fileUpdated) {
      fs.writeFileSync(filePath, content, 'utf8');
    } else {
      allUpdated = false;
    }

  } catch (error) {
    console.error(`❌ Error updating ${file.path}:`, error.message);
    allUpdated = false;
  }
}

// Update CHANGELOG.md
updateChangelog(newVersion, releaseType, releaseNotes);

try {
  syncReadmeFromChangelog();
} catch (error) {
  console.error('❌ Error syncing README.md from CHANGELOG.md:', error.message);
  allUpdated = false;
}

// Update version history in each version.ts file
try {
  for (const versionTsPath of VERSION_TS_PATHS) {
    if (!fs.existsSync(versionTsPath)) {
      continue;
    }

    let content = fs.readFileSync(versionTsPath, 'utf8');

    // This entry is keyed by `newVersion` (the version being CREATED right
    // now), so its features/bugfixes/breakingChanges must describe what
    // changed IN newVersion — i.e. gitDerivedSummary (commits since
    // versionBeforeBump). Previously this read the OLD CURRENT_VERSION
    // block's fields instead (extractFeaturesAndBugfixes(content), before
    // this same loop overwrites it below), which meant every VERSION_HISTORY
    // entry was mislabeled with the PREVIOUS release's bugfixes under the
    // NEW version's key.
    const { features, bugfixes, breakingChanges } = gitDerivedSummary;

    // Format arrays as strings for the entry
    const featuresStr = features.length > 0
      ? features.map(f => `      '${escapeJsStringLiteral(f)}'`).join(',\n')
      : '      // No new features';
    const bugfixesStr = bugfixes.length > 0
      ? bugfixes.map(f => `      '${escapeJsStringLiteral(f)}'`).join(',\n')
      : '      // No bugfixes';
    const breakingStr = breakingChanges.length > 0
      ? breakingChanges.map(f => `      '${escapeJsStringLiteral(f)}'`).join(',\n')
      : '';

    // Add new version to VERSION_HISTORY
    const newVersionEntry = `  '${newVersion}': {
    version: '${newVersion}',
    buildNumber: ${buildNumber},
    releaseDate: '${releaseDate}',
    releaseType: '${releaseType}',
    environment: 'development',
    features: [
${featuresStr}
    ],
    bugfixes: [
${bugfixesStr}
    ],
    breakingChanges: [${breakingStr ? '\n' + breakingStr + '\n    ' : ''}],
    notes: '${escapeJsStringLiteral(releaseNotes || gitDerivedSummary.notes || `Version ${newVersion} release`)}'
  },`;

    // Check if version already exists in VERSION_HISTORY to avoid duplicates
    const versionExistsRegex = new RegExp(`'${newVersion.replace(/\./g, '\\.')}':\\s*\\{`);
    if (versionExistsRegex.test(content)) {
      console.log(`ℹ️ Version ${newVersion} already exists in VERSION_HISTORY, skipping duplicate entry`);
    } else {
      // Insert the new version entry at the beginning of VERSION_HISTORY
      const historyRegex = /(export const VERSION_HISTORY: VersionHistory = {)/;
      if (historyRegex.test(content)) {
        content = content.replace(historyRegex, `$1\n${newVersionEntry}`);
        fs.writeFileSync(versionTsPath, content, 'utf8');
        console.log(`✅ Added ${newVersion} to version history (${path.relative(projectRoot, versionTsPath)})`);
      }
    }
  }
} catch (error) {
  console.error('❌ Error updating version history:', error.message);
  allUpdated = false;
}

// Generate versions.json from each version.ts file
// SINGLE SOURCE OF TRUTH: version.ts is the master file
// versions.json is auto-generated from version.ts and should never be edited manually
// This ensures consistency and prevents version mismatches
try {
  for (const target of VERSIONS_JSON_TARGETS) {
    const { versionTsPath, versionsJsonPath } = target;
    if (!fs.existsSync(versionTsPath)) {
      continue;
    }

    const versionTsContent = fs.readFileSync(versionTsPath, 'utf8');

    // Extract all versions from VERSION_HISTORY in version.ts
    const versionHistoryRegex = /export const VERSION_HISTORY: VersionHistory = \{([\s\S]*?)\};/;
    const historyMatch = versionTsContent.match(versionHistoryRegex);

    if (historyMatch) {
      const historyContent = historyMatch[1];

      // Extract CURRENT_VERSION to get current version
      const currentVersionMatch = versionTsContent.match(/version:\s*packageJson\.version/);
      const currentVersionFromPackage = getCurrentVersion(); // Use package.json as source

      // Parse all version entries from VERSION_HISTORY
      // Use a simpler, more reliable approach: find all version entries
      const versions = [];
      const entries = [];

      // Find all version entries using a pattern that matches the structure
      // Pattern: 'version': { ... } where ... can contain nested objects
      const versionEntryPattern = /'(\d+\.\d+\.\d+)':\s*\{/g;
      const versionMatches = [];
      let match;

      while ((match = versionEntryPattern.exec(historyContent)) !== null) {
        versionMatches.push({
          version: match[1],
          startIndex: match.index
        });
      }

      // Extract content for each version entry
      for (let i = 0; i < versionMatches.length; i++) {
        const startIndex = versionMatches[i].startIndex;
        const endIndex = i < versionMatches.length - 1
          ? versionMatches[i + 1].startIndex
          : historyContent.length;

        // Find the matching closing brace for this entry
        let braceCount = 0;
        let entryEnd = startIndex;
        for (let j = startIndex; j < endIndex; j++) {
          if (historyContent[j] === '{') braceCount++;
          if (historyContent[j] === '}') {
            braceCount--;
            if (braceCount === 0) {
              entryEnd = j + 1;
              break;
            }
          }
        }

        entries.push({
          version: versionMatches[i].version,
          content: historyContent.substring(startIndex, entryEnd)
        });
      }

      // Parse each entry
      for (const entry of entries) {
        const entryContent = entry.content;

        // Extract fields from the entry
        const buildNumberMatch = entryContent.match(/buildNumber:\s*(\d+)/);
        const releaseDateMatch = entryContent.match(/releaseDate:\s*'([^']+)'/);
        const releaseTypeMatch = entryContent.match(/releaseType:\s*'([^']+)'/);
        const notesMatch = entryContent.match(/notes:\s*'([^']+)'/);

        // Extract arrays - handle multiline arrays
        const featuresMatch = entryContent.match(/features:\s*\[([\s\S]*?)\]/);
        const bugfixesMatch = entryContent.match(/bugfixes:\s*\[([\s\S]*?)\]/);
        const breakingMatch = entryContent.match(/breakingChanges:\s*\[([\s\S]*?)\]/);

        const extractArrayItems = (match) => {
          if (!match) return [];
          const content = match[1].trim();
          if (!content) return [];

          const items = [];
          const quotedStringPattern = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
          let itemMatch;

          while ((itemMatch = quotedStringPattern.exec(content)) !== null) {
            const rawValue = itemMatch[1] ?? itemMatch[2] ?? '';
            items.push(decodeJsStringLiteralValue(rawValue));
          }

          return items;
        };

        versions.push({
          version: entry.version,
          buildNumber: buildNumberMatch ? parseInt(buildNumberMatch[1]) : 0,
          releaseDate: releaseDateMatch ? releaseDateMatch[1] : releaseDate,
          releaseType: releaseTypeMatch ? releaseTypeMatch[1] : releaseType,
          environment: 'development',
          features: extractArrayItems(featuresMatch),
          bugfixes: extractArrayItems(bugfixesMatch),
          breakingChanges: extractArrayItems(breakingMatch),
          notes: notesMatch ? notesMatch[1].replace(/\\'/g, "'") : `Version ${entry.version} release`
        });
      }

      // Remove duplicates (keep first occurrence)
      const seenVersions = new Set();
      const uniqueVersions = versions.filter(v => {
        if (seenVersions.has(v.version)) {
          console.warn(`⚠️ Removing duplicate version entry: ${v.version}`);
          return false;
        }
        seenVersions.add(v.version);
        return true;
      });

      // Sort versions by version number (newest first)
      uniqueVersions.sort((a, b) => {
        const aParts = a.version.split('.').map(Number);
        const bParts = b.version.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
          if (bParts[i] !== aParts[i]) return bParts[i] - aParts[i];
        }
        return 0;
      });

      // Create versions.json structure from version.ts
      const versionsData = {
        _comment: "⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️",
        _source: "This file is automatically generated from apps/mobile-app/config/version.ts",
        _instructions: "To update versions, edit apps/mobile-app/config/version.ts and run: npm run version:bump",
        currentVersion: currentVersionFromPackage,
        versions: uniqueVersions
      };

      // Write generated JSON file
      fs.writeFileSync(versionsJsonPath, JSON.stringify(versionsData, null, 2) + '\n', 'utf8');
      const relativeVersionsPath = path.relative(projectRoot, versionsJsonPath);
      console.log(`✅ Generated ${relativeVersionsPath} from ${path.relative(projectRoot, versionTsPath)} (source of truth)`);
      console.log(`✅ Updated ${relativeVersionsPath}: currentVersion = ${currentVersionFromPackage}`);
    } else {
      console.warn(`⚠️ Could not parse VERSION_HISTORY from ${path.relative(projectRoot, versionTsPath)}`);
    }
  }
} catch (error) {
  console.error('❌ Error generating versions.json from version.ts:', error.message);
  allUpdated = false;
}

if (!skipGitInfo) {
  try {
    // Get current git information
    let gitCommit = 'unknown';
    let gitCommitFull = 'unknown';
    let gitBranch = 'main';
    let gitRepoUrl = 'https://github.com/hashpass-tech/hashpass.tech';

    try {
      gitCommit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();
      gitCommitFull = execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();
      gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();
      const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf8', cwd: projectRoot }).trim();

      // Convert SSH URL to HTTPS if needed
      if (remoteUrl.startsWith('git@')) {
        gitRepoUrl = remoteUrl.replace('git@github.com:', 'https://github.com/').replace('.git', '');
      } else if (remoteUrl.startsWith('https://')) {
        gitRepoUrl = remoteUrl.replace('.git', '');
      }
    } catch (gitError) {
      console.warn('⚠️  Could not get git information, using defaults');
    }

    const gitInfo = {
      gitCommit: gitCommit,
      gitCommitFull: gitCommitFull,
      gitBranch: gitBranch,
      gitRepoUrl: gitRepoUrl
    };

    for (const gitInfoPath of GIT_INFO_PATHS) {
      if (!fs.existsSync(path.dirname(gitInfoPath))) {
        continue;
      }

      fs.writeFileSync(gitInfoPath, JSON.stringify(gitInfo, null, 2) + '\n', 'utf8');
      console.log(`✅ Updated ${path.relative(projectRoot, gitInfoPath)}: commit = ${gitCommit}, branch = ${gitBranch}`);
    }
  } catch (error) {
    console.error('❌ Error updating apps/mobile-app/config/git-info.json:', error.message);
    // Don't fail the whole process if git info update fails
  }
}

// Git operations (if requested)
const performGitOperations = async () => {
  if (!shouldCommit && !shouldTag && !shouldPush && !autoGit) {
    return;
  }

  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: projectRoot }).trim();

    // Commit changes
    if (autoGit || shouldCommit) {
      console.log('\n📝 Creating commit for version ' + newVersion + '...');
      execSync('git add .', { cwd: projectRoot, stdio: 'inherit' });
      execSync(`git commit -m "${commitMessage || `chore: bump version to ${newVersion} (build ${buildNumber})`}"`, {
        cwd: projectRoot,
        stdio: 'inherit'
      });
    }

    // Create tag
    if (autoGit || shouldTag) {
      console.log('🏷️  Creating tag v' + newVersion + '...');
      execSync(`git tag -a "v${newVersion}" -m "Version ${newVersion}"`, {
        cwd: projectRoot,
        stdio: 'inherit'
      });
    }

    // Push changes
    if (autoGit || shouldPush) {
      console.log('🚀 Pushing changes to ' + currentBranch + '...');
      execSync(`git push origin "${currentBranch}"`, {
        cwd: projectRoot,
        stdio: 'inherit'
      });
      if (autoGit || shouldTag) {
        execSync('git push --tags', {
          cwd: projectRoot,
          stdio: 'inherit'
        });
      }
      console.log(`\n🎉 Version ${newVersion} (build ${buildNumber}) has been successfully released!`);
      console.log(`🔗 Changes have been pushed to the ${currentBranch} branch and tagged as v${newVersion}.`);
    }
  } catch (gitError) {
    console.error('❌ Error performing git operations:', gitError.message);
    console.log('\n⚠️  Git operations failed, but version files were updated successfully.');
    console.log('You can manually commit and push the changes.');
  }
};

// Update service worker version
try {
  const updateSwVersionPath = path.join(__dirname, 'update-sw-version.mjs');
  if (fs.existsSync(updateSwVersionPath)) {
    console.log('🔄 Updating service worker version...');
    execSync(`node ${updateSwVersionPath}`, {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    console.log('✅ Service worker version updated');
  }
} catch (swError) {
  console.warn('⚠️  Warning: Could not update service worker version:', swError.message);
}

// Summary
(async () => {
  if (allUpdated) {
    console.log(`\n🎉 Successfully updated to version ${newVersion}!`);
    console.log(`📝 Release type: ${releaseType}`);
    console.log(`📅 Release date: ${releaseDate}`);
    console.log(`🔢 Build number: ${buildNumber}`);
    if (releaseNotes) {
      console.log(`📋 Notes: ${releaseNotes}`);
    }
    console.log('\n📁 Files updated:');
    filesToUpdate.forEach(file => console.log(`   - ${file.path}`));
    console.log('   - apps/mobile-app/config/versions.json');
    console.log('   - apps/mobile-app/app.json');
    console.log('   - apps/mobile-app/config/version.production.json');
    console.log('   - apps/mobile-app/config/version.development.json');
    console.log('   - apps/mobile-app/config/git-info.json');
    console.log('   - CHANGELOG.md');
    console.log('   - README.md');
    console.log('   - apps/mobile-app/public/sw.js');

    // Perform git operations if requested
    await performGitOperations();

    if (!shouldCommit && !shouldTag && !shouldPush && !autoGit) {
      console.log('\n🚀 Next steps:');
      console.log('   1. Review the changes: git diff');
      console.log('   2. Test the build: npm run build:web');
      console.log('   3. Commit the changes: git add . && git commit -m "chore: bump version to ' + newVersion + '"');
      console.log('   4. Create tag: git tag -a "v' + newVersion + '" -m "Version ' + newVersion + '"');
      console.log('   5. Push to repository: git push origin <branch> && git push --tags');
      console.log('\n💡 Tip: Use --auto-git flag to automatically commit, tag, and push');
      console.log('   Example: npm run version:update ' + newVersion + ' -- --auto-git');
    }
  } else {
    console.log('\n❌ Some files could not be updated. Please check the errors above.');
    process.exit(1);
  }
})();
