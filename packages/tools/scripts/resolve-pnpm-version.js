#!/usr/bin/env node
/* global __dirname, process */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const ROOT_PACKAGE_JSON = path.join(ROOT_DIR, 'package.json');

function resolvePnpmVersion() {
  const packageJson = JSON.parse(fs.readFileSync(ROOT_PACKAGE_JSON, 'utf8'));
  const packageManager = String(packageJson.packageManager || '').trim();
  const match = packageManager.match(/^pnpm@(.+)$/);

  if (!match) {
    throw new Error(`Expected packageManager to be set to pnpm@<version> in ${ROOT_PACKAGE_JSON}`);
  }

  return match[1];
}

if (require.main === module) {
  try {
    process.stdout.write(`${resolvePnpmVersion()}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

module.exports = {
  resolvePnpmVersion,
};
