#!/usr/bin/env node

import { access, lstat, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const clubRoot = path.join(repositoryRoot, 'apps', 'web-app');
const requestedPort = process.argv[2];

if (!/^[1-9][0-9]{0,4}$/.test(requestedPort ?? '')) {
  throw new Error('Expected a valid Club development port.');
}

const runtimeDirectory = path.join(clubRoot, `.next-dev-all-runtime-${requestedPort}`);
const runtimePrefix = `${path.join(clubRoot, '.next-dev-all-runtime-')}`;

if (!runtimeDirectory.startsWith(runtimePrefix)) {
  throw new Error('Refusing to prepare a Club runtime outside its managed directory.');
}

await mkdir(runtimeDirectory, { recursive: true });

async function replaceWithSymlink(name, target) {
  const destination = path.join(runtimeDirectory, name);

  try {
    const current = await lstat(destination);
    if (current.isSymbolicLink()) {
      return;
    }
    await rm(destination, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await symlink(target, destination, 'junction');
}

// Next.js 16's App Router dev-mode route scanner does not discover routes
// through a symlinked `app` directory — a plain root-level symlink (as used
// for the other directories below) makes the dev server register zero
// routes and fall through to _not-found for every path, instantly, with no
// compile error logged. Confirmed by reproducing with an isolated runtime
// dir: identical setup works when `app` is a real directory and breaks the
// moment `app` itself becomes a symlink. Mirroring the tree with real
// directories and leaf-level file symlinks (only the individual files are
// symlinks, never a directory) works around it, since the scanner's readdir
// calls always see real directories — while still auto-reflecting edits to
// existing files instantly, same as the pre-existing symlink files elsewhere
// in this script. New/removed files need this script to re-run (already
// true today — it re-runs at every `dev:all` start).
async function mirrorDirectory(sourceDir, destDir) {
  await rm(destDir, { recursive: true, force: true });
  await mkdir(destDir, { recursive: true });

  for (const entry of await readdir(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await mirrorDirectory(sourcePath, destPath);
    } else {
      await symlink(sourcePath, destPath);
    }
  }
}

await access(path.join(clubRoot, 'app'));
await mirrorDirectory(path.join(clubRoot, 'app'), path.join(runtimeDirectory, 'app'));

for (const name of ['components', 'config', 'lib', 'public', 'node_modules']) {
  await access(path.join(clubRoot, name));
  await replaceWithSymlink(name, path.join('..', name));
}

for (const name of ['package.json', 'postcss.config.js', 'tailwind.config.ts']) {
  await replaceWithSymlink(name, path.join('..', name));
}

await writeFile(
  path.join(runtimeDirectory, 'next.config.mjs'),
  `import sourceConfig from '../next.config.mjs';\n\nexport default {\n  ...sourceConfig,\n  distDir: '.next',\n  typescript: {\n    ...sourceConfig.typescript,\n    tsconfigPath: 'tsconfig.json',\n  },\n};\n`,
);

await writeFile(
  path.join(runtimeDirectory, 'tsconfig.json'),
  `{
  "extends": "../tsconfig.json",
  "include": [
    "next-env.d.ts",
    "../app/**/*.ts",
    "../app/**/*.tsx",
    "../components/**/*.ts",
    "../components/**/*.tsx",
    "../config/**/*.ts",
    "../config/**/*.tsx",
    "../lib/**/*.ts",
    "../lib/**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
`,
);

process.stdout.write(`${runtimeDirectory}\n`);
