import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = [join(appRoot, 'app'), join(appRoot, 'components')];
const officialMarkFile = join(appRoot, 'components/ui/hashpass-logo.tsx');
const showcaseFile = join(appRoot, 'components/ui/download-options-section.tsx');
const sourceExtensions = new Set(['.ts', '.tsx']);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    return sourceExtensions.has(entry.name.slice(entry.name.lastIndexOf('.'))) ? [path] : [];
  }));

  return files.flat();
}

const sourceFiles = (await Promise.all(sourceRoots.map(collectSourceFiles))).flat();
const forbiddenClubMarkReferences = [];

for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  if (source.includes('/hashpass-club-favicon/')) {
    forbiddenClubMarkReferences.push(file.slice(appRoot.length + 1));
  }
}

const [officialMarkSource, showcaseSource] = await Promise.all([
  readFile(officialMarkFile, 'utf8'),
  readFile(showcaseFile, 'utf8'),
]);

const failures = [];
if (!officialMarkSource.includes("'/logo-hashpass.svg'")) {
  failures.push('The shared HashpassLogo component must use /logo-hashpass.svg.');
}
if (!showcaseSource.includes('<HashpassLogo')) {
  failures.push('The download showcase must render the shared HashpassLogo component.');
}
if (forbiddenClubMarkReferences.length > 0) {
  failures.push(
    `Hashpass Club favicon artwork is limited to browser-icon contexts; remove it from: ${forbiddenClubMarkReferences.join(', ')}`,
  );
}

if (failures.length > 0) {
  console.error('Brand asset guard failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}

console.log('Brand asset guard passed: product UI uses the official HASHPASS mark.');
