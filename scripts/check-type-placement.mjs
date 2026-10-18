import { execFileSync } from 'node:child_process';
import { basename, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECLARATION_PATTERN = /^\+\s*(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)\b/;
const SOURCE_PATH_PATTERN = /^(?:apps|packages)\/.*\.(?:ts|tsx|js|jsx)$/;

function isTypeModule(filePath) {
  const normalizedPath = normalize(filePath).replaceAll('\\', '/');
  const fileName = basename(normalizedPath);

  return (
    normalizedPath.includes('/types/') ||
    fileName === 'types.ts' ||
    fileName === 'types.tsx' ||
    fileName.endsWith('.types.ts') ||
    fileName.endsWith('.types.tsx') ||
    fileName.endsWith('.types.js') ||
    fileName.endsWith('.types.jsx') ||
    fileName.endsWith('.d.ts')
  );
}

function isIgnoredPath(filePath) {
  return (
    filePath.includes('/tests/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('.stories.') ||
    filePath.startsWith('archive/')
  );
}

function parseHunkStart(line) {
  const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  return match ? Number(match[1]) : null;
}

export function findTypePlacementViolations(diff) {
  const violations = [];
  let filePath = null;
  let newLine = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      filePath = line.slice('+++ b/'.length);
      newLine = null;
      continue;
    }

    if (line.startsWith('@@ ')) {
      newLine = parseHunkStart(line);
      continue;
    }

    if (!filePath || newLine === null) continue;

    if (line.startsWith('+')) {
      const declaration = line.match(DECLARATION_PATTERN);
      if (
        declaration &&
        SOURCE_PATH_PATTERN.test(filePath) &&
        !isTypeModule(filePath) &&
        !isIgnoredPath(filePath)
      ) {
        violations.push({
          filePath,
          line: newLine,
          kind: declaration[1],
          name: declaration[2],
        });
      }
      newLine += 1;
      continue;
    }

    if (!line.startsWith('-')) newLine += 1;
  }

  return violations;
}

function getDiff() {
  const baseRef = process.env.TYPE_PLACEMENT_BASE;
  const args = ['diff', '--unified=0', '--no-color'];

  if (baseRef) {
    args.push(`${baseRef}...HEAD`);
  } else {
    // HEAD includes staged and unstaged work locally. CI sets an explicit base
    // ref so the same guard checks the complete pull request diff.
    args.push('HEAD');
  }

  return execFileSync('git', args, { encoding: 'utf8' });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const violations = findTypePlacementViolations(getDiff());

  if (violations.length > 0) {
    console.error('Type placement guard failed. Move new declarations into a dedicated types module:');
    for (const violation of violations) {
      console.error(
        `- ${violation.filePath}:${violation.line} ${violation.kind} ${violation.name}`,
      );
    }
    console.error(
      'Use a nearby types/ directory or a *.types.ts(x) file, then import the type with `import type`.',
    );
    process.exitCode = 1;
  } else {
    console.log('Type placement guard passed.');
  }
}
