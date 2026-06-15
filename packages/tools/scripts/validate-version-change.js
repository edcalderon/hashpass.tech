#!/usr/bin/env node

/**
 * Version Change Validation Script
 * Ensures that version changes are made using the proper versioning script
 * and that all version files are updated consistently
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const versioningConfigPath = path.join(projectRoot, 'versioning.config.json');

// Files that should be updated when version changes
const VERSION_FILES = [
  'package.json',
  'apps/mobile-app/package.json',
  'apps/mobile-app/config/version.production.json',
  'apps/mobile-app/config/version.development.json',
  'app.json',
  'apps/mobile-app/config/version.ts',
  'apps/mobile-app/config/versions.json',
  'CHANGELOG.md'
];

function loadBranchAwareEnabled() {
  try {
    if (!fs.existsSync(versioningConfigPath)) {
      return false;
    }

    const config = JSON.parse(fs.readFileSync(versioningConfigPath, 'utf8'));
    return Boolean(config?.branchAwareness?.enabled);
  } catch (_error) {
    return false;
  }
}

// Get current staged files
function getStagedFiles() {
  try {
    const output = execSync('git diff --cached --name-only', { 
      encoding: 'utf8', 
      cwd: projectRoot 
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

// Get version from package.json
function getVersionFromFile(filePath) {
  const fullPath = path.join(projectRoot, filePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  
  if (filePath === 'package.json' || filePath === 'app.json') {
    const json = JSON.parse(content);
    if (filePath === 'package.json') {
      return json.version;
    } else {
      return json.expo?.version;
    }
  }

  if (filePath === 'apps/mobile-app/package.json') {
    const json = JSON.parse(content);
    return json.version;
  }
  
  if (filePath === 'apps/mobile-app/config/version.ts') {
    const versionMatch = content.match(/version:\s*['"]([^'"]+)['"]/);
    return versionMatch ? versionMatch[1] : null;
  }
  
  if (filePath === 'apps/mobile-app/config/versions.json') {
    const json = JSON.parse(content);
    return json.currentVersion;
  }
  
  return null;
}

// Check if version script was used
function checkVersionScriptUsage() {
  try {
    // Check if version-bump.js or update-version.mjs was run recently
    const recentCommits = execSync('git log --oneline -5', { 
      encoding: 'utf8', 
      cwd: projectRoot 
    });
    
    // Check if commit message indicates version bump
    const versionBumpPattern = /(chore:.*version|bump.*version|version.*bump)/i;
    if (versionBumpPattern.test(recentCommits)) {
      return true;
    }
    
    // Check if version script files were modified
    const stagedFiles = getStagedFiles();
    if (stagedFiles.some(f => f.includes('version-bump') || f.includes('update-version'))) {
      return true;
    }
    
    return false;
  } catch (error) {
    return false;
  }
}

// Validate version consistency
function validateVersionConsistency() {
  const versions = {};
  const errors = [];
  const warnings = [];
  const branchAwareEnabled = loadBranchAwareEnabled();
  
  // Get versions from all files
  for (const file of VERSION_FILES) {
    const version = getVersionFromFile(file);
    if (version) {
      versions[file] = version;
    } else {
      warnings.push(`⚠️  Could not read version from ${file}`);
    }
  }
  
  // Check if any version files are staged
  const stagedFiles = getStagedFiles();
  const stagedVersionFiles = stagedFiles.filter(f => VERSION_FILES.includes(f));
  
  if (stagedVersionFiles.length === 0) {
    // No version files changed, that's fine
    return { valid: true, errors: [], warnings: [] };
  }

  if (
    branchAwareEnabled &&
    stagedVersionFiles.length > 0 &&
    stagedVersionFiles.every((f) => f === 'apps/mobile-app/config/version.development.json')
  ) {
    return { valid: true, errors: [], warnings: [] };
  }
  
  // If version files are staged, check consistency
  const comparableVersions = branchAwareEnabled
    ? Object.fromEntries(
        Object.entries(versions).filter(
          ([file]) => file !== 'apps/mobile-app/config/version.development.json'
        )
      )
    : versions;
  const uniqueVersions = [...new Set(Object.values(comparableVersions))];
  
  if (uniqueVersions.length > 1) {
    errors.push('❌ Version mismatch detected:');
    for (const [file, version] of Object.entries(comparableVersions)) {
      errors.push(`   ${file}: ${version}`);
    }
    errors.push('');
    errors.push(branchAwareEnabled
      ? '💡 Production version files must stay in sync with each other.'
      : '💡 All version files must have the same version number.');
    errors.push('💡 Use the release script to update versions: npm run release -- patch');
  }
  
  // Check if version script was used
  if (stagedVersionFiles.length > 0 && !checkVersionScriptUsage()) {
    errors.push('❌ Version files were modified manually!');
    errors.push('');
    errors.push('💡 Always use the release script to update versions:');
    errors.push('   npm run release -- [patch|minor|major]');
    errors.push('   npm run release:patch | release:minor | release:major');
    errors.push('   or');
    errors.push('   npm run version:update [version]');
    errors.push('');
    errors.push('📋 The versioning script ensures:');
    errors.push('   - All version files are updated consistently');
    errors.push('   - CHANGELOG.md is updated');
    errors.push('   - Version history is maintained');
    errors.push('   - Build numbers are generated');
  }
  
  // Check if all required files are updated
  const relevantVersionFiles = branchAwareEnabled
    ? VERSION_FILES.filter(
        (f) => f !== 'apps/mobile-app/config/version.development.json'
      )
    : VERSION_FILES;

  const missingFiles = relevantVersionFiles.filter(f => {
    const version = getVersionFromFile(f);
    return !version || !stagedFiles.includes(f);
  });
  
  if (stagedVersionFiles.length > 0 && missingFiles.length > 0) {
    warnings.push('⚠️  Some version files were not updated:');
    missingFiles.forEach(f => warnings.push(`   - ${f}`));
    warnings.push('');
    warnings.push('💡 Make sure all version files are updated when bumping version.');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Main validation
function main() {
  console.log('🔍 Validating version changes...\n');
  
  const result = validateVersionConsistency();
  
  if (result.warnings.length > 0) {
    result.warnings.forEach(w => console.log(w));
    console.log('');
  }
  
  if (result.errors.length > 0) {
    result.errors.forEach(e => console.error(e));
    console.error('\n❌ Version validation failed!');
    console.error('🚫 Push blocked. Please fix the issues above.\n');
    process.exit(1);
  }
  
  if (result.valid) {
    console.log('✅ Version validation passed!\n');
    process.exit(0);
  }
}

main();
