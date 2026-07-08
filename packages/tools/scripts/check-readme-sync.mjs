#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { syncReadme } from './update-readme.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FILES_TO_STAGE = ['README.md', 'CHANGELOG.md', 'package.json'];

function readIndexedFile(relativePath) {
  const result = spawnSync('git', ['show', `:${relativePath}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status === 0) {
    return String(result.stdout || '');
  }

  const filePath = path.resolve(REPO_ROOT, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Unable to read ${relativePath} from the index or working tree.`);
  }

  return fs.readFileSync(filePath, 'utf8');
}

function writeFixture(tempDir, relativePath, content) {
  const filePath = path.resolve(tempDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function diffFiles(actualPath, expectedPath) {
  const result = spawnSync(
    'git',
    ['diff', '--no-index', '--no-ext-diff', '--unified=3', '--no-prefix', actualPath, expectedPath],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );

  if (result.status === 1) {
    return String(result.stdout || '').trim();
  }

  if (result.status === 0) {
    return '';
  }

  const stderr = String(result.stderr || '').trim();
  throw new Error(`Unable to diff README files.${stderr ? `\n${stderr}` : ''}`);
}

function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-readme-check-'));

  try {
    for (const relativePath of FILES_TO_STAGE) {
      writeFixture(tempDir, relativePath, readIndexedFile(relativePath));
    }

    syncReadme({
      cwd: tempDir,
      repoRoot: REPO_ROOT,
      quiet: true,
    });

    const expectedReadme = fs.readFileSync(path.resolve(tempDir, 'README.md'), 'utf8');
    const actualReadme = readIndexedFile('README.md');

    if (expectedReadme === actualReadme) {
      console.log('✅ README is in sync with CHANGELOG.md.');
      return;
    }

    const actualPath = path.join(tempDir, 'README.actual.md');
    const expectedPath = path.join(tempDir, 'README.expected.md');
    fs.writeFileSync(actualPath, actualReadme);
    fs.writeFileSync(expectedPath, expectedReadme);

    const diff = diffFiles(actualPath, expectedPath);
    console.error('❌ README.md is out of sync with CHANGELOG.md.');
    console.error('Run `pnpm run update-readme` and stage the result before committing.');
    if (diff) {
      console.error('');
      console.error(diff);
    }
    process.exitCode = 1;
  } catch (error) {
    console.error(`❌ README sync check failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main();
}
