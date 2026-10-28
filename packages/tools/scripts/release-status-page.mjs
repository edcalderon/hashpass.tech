#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PACKAGE_PATH = resolve(ROOT, 'apps/status-page/package.json');
const CHANGELOG_PATH = resolve(ROOT, 'apps/status-page/CHANGELOG.md');
const STAGED = ['apps/status-page/package.json', 'apps/status-page/CHANGELOG.md', 'apps/status-page/README.md'];
const VALID_BUMPS = new Set(['patch', 'minor', 'major']);

export function bumpVersion(version, bump = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

export function changelogWithRelease(source, version, date, notes) {
  const marker = 'All notable changes to the independently released Mission Control status surface are recorded here.\n';
  if (!source.includes(marker)) throw new Error('Status changelog header is missing');
  const bullets = notes.length ? notes.map((note) => `- ${note}`).join('\n') : '- Publish status-page improvements.';
  return source.replace(marker, `${marker}\n## [${version}] - ${date}\n\n${bullets}\n`);
}

function run(binary, args, { capture = false } = {}) {
  const result = spawnSync(binary, args, { cwd: ROOT, env: process.env, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.status !== 0) throw new Error(`${binary} ${args.join(' ')} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  return (result.stdout || '').trim();
}

function parseArgs(argv) {
  const options = { bump: 'patch', publish: true, allowDirty: false, dryRun: false, notes: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (VALID_BUMPS.has(arg)) options.bump = arg;
    else if (arg === '--no-publish') options.publish = false;
    else if (arg === '--allow-dirty') options.allowDirty = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--notes' && argv[index + 1]) options.notes.push(argv[++index]);
    else if (arg.startsWith('--notes=')) options.notes.push(arg.slice('--notes='.length));
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  console.log(`Usage: node packages/tools/scripts/release-status-page.mjs [patch|minor|major] [options]\n\nOptions:\n  --notes "text"  Add a changelog bullet (repeatable)\n  --no-publish   Create commit and tag without pushing\n  --allow-dirty  Permit unrelated working-tree changes\n  --dry-run      Show the version plan without changing files\n  --help         Show this help\n\nReleases run from develop and create status-vX.Y.Z tags.`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return usage();
  const branch = run('git', ['branch', '--show-current'], { capture: true });
  if (branch !== 'develop' && process.env.STATUS_RELEASE_SKIP_BRANCH_GUARD !== '1') {
    throw new Error(`Status-page releases must run from develop (current branch: ${branch || 'detached'})`);
  }
  if (!options.allowDirty && run('git', ['status', '--porcelain'], { capture: true })) {
    throw new Error('Working tree is not clean. Commit or stash changes, or use --allow-dirty.');
  }

  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  const next = bumpVersion(packageJson.version, options.bump);
  const tag = `status-v${next}`;
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}`], { cwd: ROOT, stdio: 'ignore' });
    throw new Error(`Tag ${tag} already exists`);
  } catch (error) {
    if (error.message === `Tag ${tag} already exists`) throw error;
  }

  console.log(`Status-page release: ${packageJson.version} → ${next} (${tag})`);
  if (options.dryRun) return;

  packageJson.version = next;
  writeFileSync(PACKAGE_PATH, `${JSON.stringify(packageJson, null, 2)}\n`);
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(CHANGELOG_PATH, changelogWithRelease(readFileSync(CHANGELOG_PATH, 'utf8'), next, today, options.notes));

  run('node', ['packages/tools/scripts/build-status-page.mjs', '--out', 'dist/status/index.html']);
  run('node', ['--test', 'packages/tools/test/mission-control-page.test.mjs', 'packages/tools/test/status-page-runtime.test.mjs']);
  run('git', ['add', ...STAGED]);
  run('git', ['commit', '--only', '-m', `chore(status): release v${next}`, '--', ...STAGED]);
  run('git', ['tag', '-a', tag, '-m', `Status page v${next}`]);
  if (options.publish) {
    run('git', ['push', 'origin', branch]);
    run('git', ['push', 'origin', tag]);
  }
  console.log(`Status-page release complete: ${tag}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`Release failed: ${error.message}`); process.exitCode = 1; }
}
