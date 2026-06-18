#!/usr/bin/env node

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const MOBILE_APP_TSCONFIG = path.join(ROOT_DIR, 'apps', 'mobile-app', 'tsconfig.json');
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    return null;
  }

  return (result.stdout || '').trim();
}

function resolveBaseCommit(explicitBase) {
  const refs = [];

  if (explicitBase) {
    refs.push(explicitBase);
  }

  refs.push('@{u}', 'origin/main', 'origin/develop', 'main', 'develop');

  for (const ref of refs) {
    const base = runGit(['merge-base', 'HEAD', ref]);
    if (base) {
      return base;
    }
  }

  const parent = runGit(['rev-parse', 'HEAD~1']);
  if (parent) {
    return parent;
  }

  throw new Error('Unable to determine a base commit for typechecking.');
}

function collectPaths(output, files) {
  if (!output) return;

  for (const line of output.split('\n')) {
    const filePath = line.trim();
    if (filePath) files.add(filePath);
  }
}

function getChangedFiles(baseCommit) {
  const files = new Set();

  collectPaths(runGit(['diff', '--name-only', '--diff-filter=ACMR', `${baseCommit}...HEAD`]), files);
  collectPaths(runGit(['diff', '--name-only', '--cached', '--diff-filter=ACMR']), files);
  collectPaths(runGit(['diff', '--name-only', '--diff-filter=ACMR']), files);
  collectPaths(runGit(['ls-files', '--others', '--exclude-standard']), files);

  return Array.from(files).sort();
}

function isTypeScriptFile(filePath) {
  return /\.(tsx?|d\.ts)$/.test(filePath);
}

function parseArgs(argv) {
  const options = {
    base: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--base' && argv[i + 1]) {
      options.base = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--base=')) {
      options.base = String(arg.split('=')[1]).trim();
      continue;
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node packages/tools/scripts/typecheck-changed.mjs [--base <ref>]',
      '',
      'Checks the TypeScript files changed on this branch against apps/mobile-app/tsconfig.json.',
      'By default it diffs HEAD against the best available upstream or main/develop fallback.',
    ].join('\n'),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const baseCommit = resolveBaseCommit(options.base || '');
  const changedFiles = getChangedFiles(baseCommit).filter(isTypeScriptFile);

  if (changedFiles.length === 0) {
    console.log('No changed or uncommitted TypeScript files to typecheck.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-typecheck-'));
  const tempTsconfigPath = path.join(tempDir, 'tsconfig.json');
  const tempBuildInfoPath = path.join(tempDir, 'tsconfig.tsbuildinfo');
  const files = changedFiles.map((filePath) => path.relative(tempDir, path.join(ROOT_DIR, filePath)));

  const tempConfig = {
    extends: MOBILE_APP_TSCONFIG,
    compilerOptions: {
      noEmit: true,
      incremental: false,
      skipLibCheck: true,
      tsBuildInfoFile: tempBuildInfoPath,
    },
    files,
    include: [],
  };

  fs.writeFileSync(tempTsconfigPath, `${JSON.stringify(tempConfig, null, 2)}\n`);

  console.log(`Typechecking ${changedFiles.length} changed TypeScript file(s) from ${baseCommit}...HEAD`);

  const result = spawnSync(PNPM_BIN, ['exec', 'tsc', '--noEmit', '-p', tempTsconfigPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 0);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
