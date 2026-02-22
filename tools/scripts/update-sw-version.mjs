// Script to update service worker version during build
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use the invoking working directory so the script works from root or app folders.
const projectRoot = process.cwd();

// Get version from package.json
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

const candidateSwPaths = [
  path.join(projectRoot, 'public/sw.js'),
  path.join(projectRoot, 'apps/web-app/public/sw.js'),
];

let updatedCount = 0;

for (const swPath of candidateSwPaths) {
  if (!fs.existsSync(swPath)) {
    continue;
  }

  let swContent = fs.readFileSync(swPath, 'utf8');
  const nextContent = swContent.replace(
    /const APP_VERSION = ['"][^'"]+['"];/,
    `const APP_VERSION = '${version}';`
  );

  if (nextContent !== swContent) {
    fs.writeFileSync(swPath, nextContent, 'utf8');
    updatedCount += 1;
    console.log(`✅ Updated service worker version in ${path.relative(projectRoot, swPath) || 'public/sw.js'}`);
  }
}

if (updatedCount === 0) {
  console.warn('⚠️  No service worker file was updated.');
} else {
  console.log(`✅ Updated service worker version to ${version} (${updatedCount} file${updatedCount === 1 ? '' : 's'})`);
}
