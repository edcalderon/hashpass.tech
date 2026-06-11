#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..', '..');
const webAppRoot = path.join(projectRoot, 'apps', 'web-app');
const packageJsonPath = path.join(webAppRoot, 'package.json');
const changelogPath = path.join(webAppRoot, 'CHANGELOG.md');
const versionsJsonPath = path.join(webAppRoot, 'config', 'versions.json');
const gitInfoPath = path.join(webAppRoot, 'config', 'git-info.json');

const VERSION_REGEX = /^\d+\.\d+\.\d+$/;
const VALID_RELEASE_TYPES = new Set(['stable', 'beta', 'rc', 'alpha']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function getCurrentVersion() {
  return readJson(packageJsonPath).version;
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

function compareVersions(leftVersion, rightVersion) {
  const leftParts = leftVersion.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = rightVersion.split('.').map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;

    if (leftPart > rightPart) return -1;
    if (leftPart < rightPart) return 1;
  }

  return 0;
}

function createVersionEntry(version, releaseType, notes) {
  const releaseDate = new Date().toISOString().slice(0, 10);
  const buildNumber = Number.parseInt(new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14), 10);

  return {
    version,
    buildNumber,
    releaseDate,
    releaseType,
    environment: 'production',
    features: [],
    bugfixes: [],
    breakingChanges: [],
    notes: notes || `Version ${version} release`,
  };
}

function updatePackageJson(version) {
  const packageJson = readJson(packageJsonPath);
  packageJson.version = version;
  writeJson(packageJsonPath, packageJson);
}

function updateVersionsJson(entry) {
  const existing = fs.existsSync(versionsJsonPath)
    ? readJson(versionsJsonPath)
    : {
        _comment: '⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️',
        _source: 'This file is generated from apps/web-app/package.json',
        _instructions: 'Run npm run version:update or npm run release:patch from apps/web-app to update it.',
        currentVersion: entry,
        versions: [],
  };

  const versions = Array.isArray(existing.versions) ? existing.versions : [];
  const filteredVersions = versions.filter((item) => item?.version !== entry.version);
  filteredVersions.unshift(entry);
  filteredVersions.sort((left, right) => compareVersions(left.version, right.version));

  const output = {
    _comment: existing._comment || '⚠️ AUTO-GENERATED FILE - DO NOT EDIT MANUALLY ⚠️',
    _source: existing._source || 'This file is generated from apps/web-app/package.json',
    _instructions:
      existing._instructions || 'Run npm run version:update or npm run release:patch from apps/web-app to update it.',
    currentVersion: entry,
    versions: filteredVersions,
  };

  writeJson(versionsJsonPath, output);
}

function updateChangelog(entry) {
  const releaseTitle = entry.releaseType === 'stable' ? 'Stable' : entry.releaseType.charAt(0).toUpperCase() + entry.releaseType.slice(1);
  const changelogEntry = [
    `## [${entry.version}] - ${entry.releaseDate}`,
    '',
    `### ${releaseTitle}`,
    `- ${entry.notes || `Version ${entry.version} release`}`,
    '',
    '### Technical Details',
    `- Version: ${entry.version}`,
    `- Release Type: ${entry.releaseType}`,
    `- Build Number: ${entry.buildNumber}`,
    `- Release Date: ${entry.releaseDate}`,
  ].join('\n');

  const header = '# Changelog';
  const intro = [
    header,
    '',
    'All notable changes to the HashPass Club web app will be documented in this file.',
    '',
    'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),',
    'and the project follows Semantic Versioning.',
  ].join('\n');

  const current = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : intro;
  if (current.includes(`## [${entry.version}]`)) {
    return;
  }

  const firstVersionIndex = current.indexOf('\n## [');
  const nextContent =
    firstVersionIndex === -1
      ? `${current.trimEnd()}\n\n${changelogEntry}\n`
      : `${current.slice(0, firstVersionIndex).trimEnd()}\n\n${changelogEntry}\n\n${current.slice(firstVersionIndex + 1).trimStart()}`;

  fs.mkdirSync(path.dirname(changelogPath), { recursive: true });
  fs.writeFileSync(changelogPath, `${nextContent.trimEnd()}\n`);
}

function updateGitInfo() {
  const gitInfo = {
    gitCommit: 'unknown',
    gitCommitFull: 'unknown',
    gitBranch: 'main',
    gitRepoUrl: 'https://github.com/hashpass-tech/hashpass.tech',
  };

  try {
    gitInfo.gitCommit = execSync('git rev-parse --short HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
    gitInfo.gitCommitFull = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
    gitInfo.gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();

    const remoteUrl = execSync('git remote get-url origin', { cwd: projectRoot, encoding: 'utf8' }).trim();
    if (remoteUrl.startsWith('git@')) {
      gitInfo.gitRepoUrl = remoteUrl
        .replace('git@github.com:', 'https://github.com/')
        .replace(/\.git$/, '');
    } else if (remoteUrl.startsWith('https://')) {
      gitInfo.gitRepoUrl = remoteUrl.replace(/\.git$/, '');
    }
  } catch (_error) {
    // Keep the defaults if the repository is not fully configured yet.
  }

  writeJson(gitInfoPath, gitInfo);
}

function parseArgs(argv) {
  const options = {
    version: '',
    bump: 'patch',
    releaseType: 'stable',
    notes: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (VERSION_REGEX.test(arg)) {
      options.version = arg;
      continue;
    }

    if (['patch', 'minor', 'major'].includes(arg)) {
      options.bump = arg;
      continue;
    }

    if (arg.startsWith('--type=')) {
      options.releaseType = arg.split('=')[1] || options.releaseType;
      continue;
    }

    if (arg === '--type' && argv[index + 1]) {
      options.releaseType = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith('--notes=')) {
      options.notes = arg.split('=')[1] || '';
      continue;
    }

    if (arg === '--notes' && argv[index + 1]) {
      options.notes = argv[index + 1];
      index += 1;
      continue;
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node packages/tools/scripts/update-club-web-version.mjs [version|patch|minor|major] [options]',
      '',
      'Options:',
      '  --type <stable|beta|rc|alpha>  Release type (default: stable)',
      '  --notes "<text>"               Release notes',
      '  -h, --help                     Show this help',
    ].join('\n')
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  if (!VALID_RELEASE_TYPES.has(options.releaseType)) {
    throw new Error(`Invalid release type "${options.releaseType}"`);
  }

  const currentVersion = getCurrentVersion();
  const nextVersion = options.version
    ? options.version
    : bumpVersion(currentVersion, options.bump);

  if (!VERSION_REGEX.test(nextVersion)) {
    throw new Error(`Invalid semantic version "${nextVersion}"`);
  }

  const versionEntry = createVersionEntry(nextVersion, options.releaseType, options.notes);
  updatePackageJson(nextVersion);
  updateVersionsJson(versionEntry);
  updateChangelog(versionEntry);
  updateGitInfo();

  console.log(`✅ Updated club web app version to ${nextVersion}`);
  console.log('✅ Synced apps/web-app/package.json');
  console.log('✅ Synced apps/web-app/config/versions.json');
  console.log('✅ Synced apps/web-app/config/git-info.json');
  console.log('✅ Updated apps/web-app/CHANGELOG.md');
}

main();
