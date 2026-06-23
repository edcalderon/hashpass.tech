#!/usr/bin/env node
/**
 * Updates nativeVersion in update-policy.json to match the current package.json version.
 * Run this BEFORE triggering the Android CI build so the API correctly reports
 * which version exists in the Play Store.
 *
 * Usage:
 *   npm run release:native          — sets nativeVersion = current package.json version
 *   npm run release:native 1.8.96   — sets nativeVersion = explicit version
 */
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const policyPath = path.join(root, 'apps/mobile-app/config/update-policy.json');
const pkgPath = path.join(root, 'apps/mobile-app/package.json');

const targetVersion = process.argv[2] || JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf-8'));
const prev = policy.nativeVersion;
policy.nativeVersion = targetVersion;
policy.nativeVersionDate = new Date().toISOString().slice(0, 10);

fs.writeFileSync(policyPath, JSON.stringify(policy, null, 2) + '\n');
console.log(`✅ nativeVersion: ${prev ?? '(none)'} → ${targetVersion} (${policy.nativeVersionDate})`);
