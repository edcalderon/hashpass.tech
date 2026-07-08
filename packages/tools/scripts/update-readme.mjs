#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_README = 'README.md';
const DEFAULT_CHANGELOG = 'CHANGELOG.md';
const DEFAULT_PACKAGE_JSON = 'package.json';

function resolveVersioningCli(repoRoot = DEFAULT_REPO_ROOT) {
  const packageJsonPath = require.resolve('@edcalderon/versioning/package.json', {
    paths: [repoRoot],
  });
  return path.join(path.dirname(packageJsonPath), 'dist', 'cli.js');
}

function runVersioningUpdateReadme({
  cwd = DEFAULT_REPO_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
  readme = DEFAULT_README,
  changelog = DEFAULT_CHANGELOG,
  pkg = DEFAULT_PACKAGE_JSON,
  quiet = false,
} = {}) {
  const cliPath = resolveVersioningCli(repoRoot);
  const result = spawnSync(
    process.execPath,
    [cliPath, 'update-readme', '--readme', readme, '--changelog', changelog, '--pkg', pkg],
    {
      cwd,
      env: process.env,
      stdio: quiet ? 'pipe' : 'inherit',
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    const stdout = String(result.stdout || '').trim();
    const details = [stdout, stderr].filter(Boolean).join('\n');
    throw new Error(
      `versioning update-readme failed${details ? `:\n${details}` : ''}`
    );
  }
}

function normalizeReadmeFooter(readmePath) {
  const content = fs.readFileSync(readmePath, 'utf8');
  const normalized = content.replace(
    /For full version history, see \[CHANGELOG\.md\]\(\.\/CHANGELOG\.md\) and \[GitHub releases\]\(https:\/\/github\.com\/hashpass-tech\/hashpass\.tech\/releases\)/g,
    'For full version history, see [CHANGELOG.md](./CHANGELOG.md)'
  );

  if (normalized !== content) {
    fs.writeFileSync(readmePath, normalized);
  }
}

export function syncReadme(options = {}) {
  const {
    cwd = DEFAULT_REPO_ROOT,
    repoRoot = DEFAULT_REPO_ROOT,
    readme = DEFAULT_README,
    changelog = DEFAULT_CHANGELOG,
    pkg = DEFAULT_PACKAGE_JSON,
    quiet = false,
  } = options;

  const readmePath = path.resolve(cwd, readme);
  if (!fs.existsSync(readmePath)) {
    throw new Error(`README not found at ${readmePath}`);
  }

  runVersioningUpdateReadme({
    cwd,
    repoRoot,
    readme,
    changelog,
    pkg,
    quiet,
  });
  normalizeReadmeFooter(readmePath);

  if (!quiet) {
    console.log(`✅ README synced from CHANGELOG.md`);
  }

  return { readmePath };
}

function parseArgs(argv) {
  const options = {
    cwd: DEFAULT_REPO_ROOT,
    repoRoot: DEFAULT_REPO_ROOT,
    readme: DEFAULT_README,
    changelog: DEFAULT_CHANGELOG,
    pkg: DEFAULT_PACKAGE_JSON,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }
    if (arg === '--quiet') {
      options.quiet = true;
      continue;
    }
    if (arg === '--cwd' && argv[i + 1]) {
      options.cwd = path.resolve(argv[++i]);
      continue;
    }
    if (arg.startsWith('--cwd=')) {
      options.cwd = path.resolve(arg.slice('--cwd='.length));
      continue;
    }
    if (arg === '--repo-root' && argv[i + 1]) {
      options.repoRoot = path.resolve(argv[++i]);
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      options.repoRoot = path.resolve(arg.slice('--repo-root='.length));
      continue;
    }
    if (arg === '--readme' && argv[i + 1]) {
      options.readme = argv[++i];
      continue;
    }
    if (arg.startsWith('--readme=')) {
      options.readme = arg.slice('--readme='.length);
      continue;
    }
    if (arg === '--changelog' && argv[i + 1]) {
      options.changelog = argv[++i];
      continue;
    }
    if (arg.startsWith('--changelog=')) {
      options.changelog = arg.slice('--changelog='.length);
      continue;
    }
    if (arg === '--pkg' && argv[i + 1]) {
      options.pkg = argv[++i];
      continue;
    }
    if (arg.startsWith('--pkg=')) {
      options.pkg = arg.slice('--pkg='.length);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage: update-readme [options]',
    '',
    'Sync README.md from CHANGELOG.md using @edcalderon/versioning.',
    '',
    'Options:',
    `  --cwd <path>        Working directory containing the README (default: ${DEFAULT_REPO_ROOT})`,
    `  --repo-root <path>  Repo root used to resolve the versioning package`,
    `  --readme <file>     README file path relative to cwd (default: ${DEFAULT_README})`,
    `  --changelog <file>  CHANGELOG file path relative to cwd (default: ${DEFAULT_CHANGELOG})`,
    `  --pkg <file>        package.json path relative to cwd (default: ${DEFAULT_PACKAGE_JSON})`,
    '  --quiet             Suppress summary logs',
    '  -h, --help          Show help',
  ].join('\n'));
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      return;
    }

    syncReadme(options);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] || '') === __filename) {
  main();
}

export { resolveVersioningCli };
