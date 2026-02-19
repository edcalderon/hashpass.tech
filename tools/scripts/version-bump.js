#!/usr/bin/env node

/**
 * Wrapper script for version bumping via npm
 * Auto-detects current version and increments it, or accepts explicit version
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Get all arguments except node and script name
const args = process.argv.slice(2);

// Function to get current version from package.json
function getCurrentVersion() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
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

// Find version number or bump type
const versionRegex = /^\d+\.\d+\.\d+$/;
const versionIndex = args.findIndex(arg => versionRegex.test(arg));
const bumpTypeIndex = args.findIndex(arg => ['patch', 'minor', 'major'].includes(arg));

let version;
let otherArgs = [...args];

if (versionIndex !== -1) {
  // Explicit version provided
  version = args[versionIndex];
  otherArgs = [...args.slice(0, versionIndex), ...args.slice(versionIndex + 1)];
} else if (bumpTypeIndex !== -1) {
  // Bump type provided, auto-increment
  const bumpType = args[bumpTypeIndex];
  const currentVersion = getCurrentVersion();
  version = incrementVersion(currentVersion, bumpType);
  console.log(`📦 Auto-detected current version: ${currentVersion}`);
  console.log(`⬆️  Bumping ${bumpType} version to: ${version}`);
  otherArgs = [...args.slice(0, bumpTypeIndex), ...args.slice(bumpTypeIndex + 1)];
} else {
  // No version or bump type, default to patch increment
  const currentVersion = getCurrentVersion();
  version = incrementVersion(currentVersion, 'patch');
  console.log(`📦 Auto-detected current version: ${currentVersion}`);
  console.log(`⬆️  Auto-incrementing patch version to: ${version}`);
}

// Reorder: version first, then flags
const reorderedArgs = [version, ...otherArgs, '--auto-git'];

// Execute the actual script
const scriptPath = path.join(__dirname, 'update-version.mjs');
const child = spawn('node', [scriptPath, ...reorderedArgs], {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  process.exit(code || 0);
});

