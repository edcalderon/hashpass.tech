#!/usr/bin/env node

import { access, lstat, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
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

for (const name of ['app', 'components', 'config', 'lib', 'public', 'node_modules']) {
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
