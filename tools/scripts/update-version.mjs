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
const projectRoot = path.join(__dirname, '..');

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

// Git operation flags (optional)
const shouldCommit = args.includes('--commit') || args.includes('-c');
const shouldTag = args.includes('--tag') || args.includes('-t');
const shouldPush = args.includes('--push') || args.includes('-p');
const autoGit = args.includes('--auto-git'); // Shorthand for --commit --tag --push

// Determine version
let newVersion;

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

  // Check if the changelog already has this version
  if (content.includes(`## [${version}]`)) {
    console.log(`ℹ️ Version ${version} already exists in CHANGELOG.md, skipping update`);
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
    path: 'lambda/package.json',
    updates: [
      {
        key: 'version',
        value: newVersion
      }
    ]
  },
  {
    path: 'app.json',
    updates: [
      {
        key: 'expo.version',
        value: newVersion
      }
    ]
  },
  {
    path: 'config/version.ts',
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
        value: `'${releaseNotes || `Version ${newVersion} release`}'`,
        pattern: /notes:\s*'[^']*'/
      }
    ]
  }
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
      }

      if (updated) {
        fileUpdated = true;
        console.log(`✅ Updated ${file.path}: ${update.key} = ${update.value}`);
      } else {
        console.warn(`⚠️  Could not find ${update.key} in ${file.path}`);
      }
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

// Helper function to extract features and bugfixes from CURRENT_VERSION
function extractFeaturesAndBugfixes(content) {
  const features = [];
  const bugfixes = [];
  const breakingChanges = [];

  // Extract CURRENT_VERSION block
  const currentVersionMatch = content.match(/export const CURRENT_VERSION: VersionInfo = \{([\s\S]*?)\};/);
  if (!currentVersionMatch) {
    console.warn('⚠️  Could not find CURRENT_VERSION block, using empty arrays');
    return { features, bugfixes, breakingChanges };
  }

  const currentVersionContent = currentVersionMatch[1];

  // Extract features array from CURRENT_VERSION only
  const featuresMatch = currentVersionContent.match(/features:\s*\[([\s\S]*?)\],/);
  if (featuresMatch) {
    const featuresContent = featuresMatch[1];
    const featureLines = featuresContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith("'") || trimmed.startsWith('"');
    });
    features.push(...featureLines.map(line => {
      const match = line.match(/['"](.*?)['"]/);
      return match ? match[1] : '';
    }).filter(f => f));
  }

  // Extract bugfixes array from CURRENT_VERSION only
  const bugfixesMatch = currentVersionContent.match(/bugfixes:\s*\[([\s\S]*?)\],/);
  if (bugfixesMatch) {
    const bugfixesContent = bugfixesMatch[1];
    const bugfixLines = bugfixesContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith("'") || trimmed.startsWith('"');
    });
    bugfixes.push(...bugfixLines.map(line => {
      const match = line.match(/['"](.*?)['"]/);
      return match ? match[1] : '';
    }).filter(f => f));
  }

  // Extract breakingChanges array from CURRENT_VERSION only
  const breakingMatch = currentVersionContent.match(/breakingChanges:\s*\[([\s\S]*?)\],/);
  if (breakingMatch) {
    const breakingContent = breakingMatch[1];
    const breakingLines = breakingContent.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.startsWith("'") || trimmed.startsWith('"');
    });
    breakingChanges.push(...breakingLines.map(line => {
      const match = line.match(/['"](.*?)['"]/);
      return match ? match[1] : '';
    }).filter(f => f));
  }

  return { features, bugfixes, breakingChanges };
}

// Update version history in version.ts
try {
  const versionTsPath = path.join(projectRoot, 'config/version.ts');
  if (fs.existsSync(versionTsPath)) {
    let content = fs.readFileSync(versionTsPath, 'utf8');

    // Extract features and bugfixes from CURRENT_VERSION
    const { features, bugfixes, breakingChanges } = extractFeaturesAndBugfixes(content);

    // Format arrays as strings for the entry
    const featuresStr = features.length > 0
      ? features.map(f => `      '${f.replace(/'/g, "\\'")}'`).join(',\n')
      : '      // No new features';
    const bugfixesStr = bugfixes.length > 0
      ? bugfixes.map(f => `      '${f.replace(/'/g, "\\'")}'`).join(',\n')
      : '      // No bugfixes';
    const breakingStr = breakingChanges.length > 0
      ? breakingChanges.map(f => `      '${f.replace(/'/g, "\\'")}'`).join(',\n')
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
    notes: '${(releaseNotes || `Version ${newVersion} release`).replace(/'/g, "\\'")}'
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
        console.log(`✅ Added ${newVersion} to version history`);
      }
    }
  }
} catch (error) {
  console.error('❌ Error updating version history:', error.message);
  allUpdated = false;
}

// Generate config/versions.json from version.ts
// SINGLE SOURCE OF TRUTH: version.ts is the master file
// versions.json is auto-generated from version.ts and should never be edited manually
// This ensures consistency and prevents version mismatches
try {
  const versionsJsonPath = path.join(projectRoot, 'config/versions.json');
  const versionTsPath = path.join(projectRoot, 'config/version.ts');

  if (fs.existsSync(versionTsPath)) {
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
          if (!content || content.includes('// No')) return [];
          // Split by comma or newline, handle quoted strings
          return content
            .split(/[,\n]/)
            .map(item => {
              item = item.trim();
              // Remove comments
              if (item.includes('//')) {
                item = item.substring(0, item.indexOf('//')).trim();
              }
              // Extract quoted string
              const quotedMatch = item.match(/'([^']*(?:\\'[^']*)*)'/);
              if (quotedMatch) {
                return quotedMatch[1].replace(/\\'/g, "'");
              }
              return null;
            })
            .filter(item => item && item.length > 0);
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
        _source: "This file is automatically generated from config/version.ts",
        _instructions: "To update versions, edit config/version.ts and run: npm run version:bump",
        currentVersion: currentVersionFromPackage,
        versions: uniqueVersions
      };

      // Write generated JSON file
      fs.writeFileSync(versionsJsonPath, JSON.stringify(versionsData, null, 2) + '\n', 'utf8');
      console.log(`✅ Generated config/versions.json from version.ts (source of truth)`);
      console.log(`✅ Updated config/versions.json: currentVersion = ${currentVersionFromPackage}`);
    } else {
      console.warn('⚠️ Could not parse VERSION_HISTORY from version.ts');
    }
  }
} catch (error) {
  console.error('❌ Error generating config/versions.json from version.ts:', error.message);
  allUpdated = false;
}

// Update config/git-info.json with current git information
try {
  const gitInfoPath = path.join(projectRoot, 'config/git-info.json');

  // Get current git information
  let gitCommit = 'unknown';
  let gitCommitFull = 'unknown';
  let gitBranch = 'main';
  let gitRepoUrl = 'https://github.com/lstech-solutions/bsl2025.hashpass.tech';

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

  fs.writeFileSync(gitInfoPath, JSON.stringify(gitInfo, null, 2) + '\n', 'utf8');
  console.log(`✅ Updated config/git-info.json: commit = ${gitCommit}, branch = ${gitBranch}`);
} catch (error) {
  console.error('❌ Error updating config/git-info.json:', error.message);
  // Don't fail the whole process if git info update fails
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
      execSync(`git commit -m "chore: bump version to ${newVersion} (build ${buildNumber})"`, {
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
    console.log('   - config/versions.json');
    console.log('   - config/git-info.json');
    console.log('   - CHANGELOG.md');
    console.log('   - public/sw.js');

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