import fs from 'fs';
import path from 'path';

const candidateRoots = [
  path.join(process.cwd(), 'dist'),
  path.join(process.cwd(), 'apps/web-app/dist'),
];

const targetPattern =
  /\/assets\/__node_modules\/\.pnpm\/([^/"]+)\/node_modules\/@expo\/vector-icons\/build\/vendor\/react-native-vector-icons\/Fonts\//g;

function walkFiles(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) {
      continue;
    }

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(entryPath);
      }
    }
  }

  return files;
}

let updatedFiles = 0;
let updatedUrls = 0;

for (const rootDir of candidateRoots) {
  for (const filePath of walkFiles(rootDir)) {
    const original = fs.readFileSync(filePath, 'utf8');
    if (!original.includes('/assets/__node_modules/.pnpm/') || !original.includes('@expo/vector-icons')) {
      continue;
    }

    const next = original.replace(targetPattern, (_match, folder) => {
      updatedUrls += 1;
      return `/assets/__node_modules/.pnpm/${encodeURIComponent(folder)}/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/`;
    });

    if (next !== original) {
      fs.writeFileSync(filePath, next, 'utf8');
      updatedFiles += 1;
    }
  }
}

if (updatedFiles === 0) {
  console.warn('⚠️  No Expo vector icon asset URLs needed rewriting.');
} else {
  console.log(`✅ Rewrote ${updatedUrls} Expo vector icon asset URL${updatedUrls === 1 ? '' : 's'} across ${updatedFiles} file${updatedFiles === 1 ? '' : 's'}.`);
}
