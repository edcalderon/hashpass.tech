#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const rootDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve('dist/client');

const OLD_SEGMENT = '__node_modules/.pnpm/';
const NEW_SEGMENT = '__node_modules/pnpm/';

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function renameHiddenPnpmAssets(rootPath) {
  const hiddenDir = path.join(rootPath, 'assets', '__node_modules', '.pnpm');
  const visibleDir = path.join(rootPath, 'assets', '__node_modules', 'pnpm');

  if (!(await exists(hiddenDir))) {
    console.log('[normalize-expo-assets] No hidden .pnpm assets directory found.');
    return;
  }

  if (await exists(visibleDir)) {
    console.log(
      '[normalize-expo-assets] Visible pnpm assets directory already exists; keeping existing layout.'
    );
    return;
  }

  await fs.rename(hiddenDir, visibleDir);
  console.log(
    `[normalize-expo-assets] Renamed hidden asset directory to visible path:\n  ${hiddenDir}\n  -> ${visibleDir}`
  );
}

async function* walkFiles(startDir) {
  const entries = await fs.readdir(startDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(entryPath);
      continue;
    }
    yield entryPath;
  }
}

function shouldRewrite(filePath) {
  return (
    filePath.endsWith('.js') ||
    filePath.endsWith('.map') ||
    filePath.endsWith('.html') ||
    filePath.endsWith('.json')
  );
}

async function rewriteAssetReferences(rootPath) {
  let scanned = 0;
  let updated = 0;

  if (!(await exists(rootPath))) {
    console.log(`[normalize-expo-assets] Build output directory not found: ${rootPath}`);
    return;
  }

  for await (const filePath of walkFiles(rootPath)) {
    if (!shouldRewrite(filePath)) {
      continue;
    }

    scanned += 1;
    const source = await fs.readFile(filePath, 'utf8');
    if (!source.includes(OLD_SEGMENT)) {
      continue;
    }

    const rewritten = source.split(OLD_SEGMENT).join(NEW_SEGMENT);
    if (rewritten !== source) {
      await fs.writeFile(filePath, rewritten, 'utf8');
      updated += 1;
    }
  }

  console.log(
    `[normalize-expo-assets] Rewrote asset references in ${updated} file(s) out of ${scanned} scanned text file(s).`
  );
}

async function main() {
  console.log(`[normalize-expo-assets] Normalizing build output in ${rootDir}`);
  await renameHiddenPnpmAssets(rootDir);
  await rewriteAssetReferences(rootDir);
}

main().catch((error) => {
  console.error('[normalize-expo-assets] Failed:', error);
  process.exit(1);
});

