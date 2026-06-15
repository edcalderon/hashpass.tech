#!/usr/bin/env node
/**
 * Script to fix duplicate version entries in apps/mobile-app/config/version.ts
 * Removes duplicate entries, keeping only the first occurrence of each version
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const versionTsPath = path.join(projectRoot, 'apps/mobile-app/config/version.ts');

function fixDuplicates() {
  console.log('🔍 Reading apps/mobile-app/config/version.ts...\n');
  
  let content = fs.readFileSync(versionTsPath, 'utf8');
  
  // Find VERSION_HISTORY block
  const historyRegex = /(export const VERSION_HISTORY: VersionHistory = \{)([\s\S]*?)(\};)/;
  const historyMatch = content.match(historyRegex);
  
  if (!historyMatch) {
    console.error('❌ Could not find VERSION_HISTORY block');
    process.exit(1);
  }
  
  const historyContent = historyMatch[2];
  
  // Find all version entries
  const versionEntryPattern = /'(\d+\.\d+\.\d+)':\s*\{/g;
  const versionMatches = [];
  let match;
  
  while ((match = versionEntryPattern.exec(historyContent)) !== null) {
    versionMatches.push({
      version: match[1],
      startIndex: match.index
    });
  }
  
  console.log(`📊 Found ${versionMatches.length} version entries\n`);
  
  // Extract each entry with its full content
  const entries = [];
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
      startIndex: startIndex,
      endIndex: entryEnd,
      content: historyContent.substring(startIndex, entryEnd)
    });
  }
  
  // Find duplicates (keep first occurrence)
  const seenVersions = new Map();
  const entriesToKeep = [];
  const entriesToRemove = [];
  
  for (const entry of entries) {
    if (seenVersions.has(entry.version)) {
      entriesToRemove.push(entry);
      console.log(`⚠️  Found duplicate: ${entry.version} (removing)`);
    } else {
      seenVersions.set(entry.version, entry);
      entriesToKeep.push(entry);
    }
  }
  
  if (entriesToRemove.length === 0) {
    console.log('✅ No duplicates found!');
    return;
  }
  
  console.log(`\n📋 Summary:`);
  console.log(`   ✅ Keeping: ${entriesToKeep.length} entries`);
  console.log(`   ❌ Removing: ${entriesToRemove.length} duplicates\n`);
  
  // Remove duplicates from content
  // Sort by startIndex in reverse order to remove from end to start
  entriesToRemove.sort((a, b) => b.startIndex - a.startIndex);
  
  let newHistoryContent = historyContent;
  for (const entry of entriesToRemove) {
    // Remove the entry including the comma before it if it exists
    const beforeEntry = newHistoryContent.substring(0, entry.startIndex);
    const afterEntry = newHistoryContent.substring(entry.endIndex);
    
    // Remove trailing comma and whitespace before the entry
    const cleanedBefore = beforeEntry.replace(/,\s*$/, '').trimEnd();
    
    // Remove leading comma from afterEntry if it exists
    const cleanedAfter = afterEntry.replace(/^,\s*/, '');
    
    newHistoryContent = cleanedBefore + (cleanedBefore && cleanedAfter ? ',\n' : '') + cleanedAfter;
  }
  
  // Reconstruct the file
  const newContent = content.replace(
    historyRegex,
    `$1${newHistoryContent}$3`
  );
  
  // Write the fixed content
  fs.writeFileSync(versionTsPath, newContent, 'utf8');
  
  console.log('✅ Fixed duplicate entries in apps/mobile-app/config/version.ts');
  console.log(`   Removed ${entriesToRemove.length} duplicate entries`);
}

try {
  fixDuplicates();
  console.log('\n✅ Script completed successfully!');
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
