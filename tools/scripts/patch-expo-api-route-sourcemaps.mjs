// Patch Expo CLI to avoid generating API route source maps during CI builds.
// Expo currently hardcodes `includeSourceMaps: true` for API route exports.

import fs from 'fs';
import path from 'path';

const expoCliRelativePath = path.join(
  'node_modules',
  '@expo',
  'cli',
  'build',
  'src',
  'export',
  'exportStaticAsync.js'
);

function collectExpoCliFiles(rootDir) {
  const files = new Set();
  const direct = path.join(rootDir, expoCliRelativePath);
  if (fs.existsSync(direct)) {
    files.add(direct);
  }

  const pnpmDir = path.join(rootDir, 'node_modules', '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return files;
  }

  for (const entry of fs.readdirSync(pnpmDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('@expo+cli@')) {
      continue;
    }
    const candidate = path.join(
      pnpmDir,
      entry.name,
      'node_modules',
      '@expo',
      'cli',
      'build',
      'src',
      'export',
      'exportStaticAsync.js'
    );
    if (fs.existsSync(candidate)) {
      files.add(candidate);
    }
  }

  return files;
}

const roots = [
  process.cwd(),
  path.join(process.cwd(), '..'),
  path.join(process.cwd(), '..', '..'),
];

const targetFiles = new Set();
for (const root of roots) {
  for (const file of collectExpoCliFiles(path.resolve(root))) {
    targetFiles.add(file);
  }
}

if (targetFiles.size === 0) {
  console.warn('⚠️ Expo CLI export file not found, skipping API source-map patch');
  process.exit(0);
}

const pattern =
  /includeSourceMaps:\s*(?:true|process\.env\.EXPO_API_ROUTE_SOURCE_MAPS === 'true')/g;

let patchedFiles = 0;
let patchedEntries = 0;

for (const targetPath of targetFiles) {
  const source = fs.readFileSync(targetPath, 'utf8');
  const matches = source.match(pattern) || [];
  if (matches.length === 0) {
    continue;
  }

  const patched = source.replace(pattern, 'includeSourceMaps: false');
  fs.writeFileSync(targetPath, patched, 'utf8');
  patchedFiles += 1;
  patchedEntries += matches.length;
}

if (patchedFiles === 0) {
  console.log('✅ Expo API source-map patch already applied');
  process.exit(0);
}

console.log(`✅ Patched ${patchedEntries} includeSourceMaps entries across ${patchedFiles} file(s)`);
