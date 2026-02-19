// Script to update service worker version during build
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Get version from package.json
const packageJsonPath = path.join(projectRoot, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Update service worker file
const swPath = path.join(projectRoot, 'public/sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');

// Replace version in service worker
swContent = swContent.replace(
  /const APP_VERSION = ['"][^'"]+['"];/,
  `const APP_VERSION = '${version}';`
);

fs.writeFileSync(swPath, swContent, 'utf8');
console.log(`✅ Updated service worker version to ${version}`);

