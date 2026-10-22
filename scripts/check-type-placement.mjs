import { execFileSync } from 'node:child_process';
import { basename, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DECLARATION_PATTERN =
  /^\+\s*(?:export\s+)?(?:declare\s+)?(interface|type)\s+([A-Za-z_$][\w$]*)\b/;
const SOURCE_PATH_PATTERN = /^(?:apps|packages)\/.*\.(?:ts|tsx|js|jsx)$/;
const DIFF_MAX_BUFFER = 64 * 1024 * 1024;

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

export function buildDiffArgs(env = process.env) {
  const args = [
    'diff',
    '--unified=0',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
  ];

  if (env.TYPE_PLACEMENT_STAGED === '1') {
    // Pre-commit must inspect exactly what will be committed. Using HEAD here
    // also includes unrelated unstaged edits and makes the local result differ
    // from the commit that CI reviews.
    args.push('--cached');
  } else if (env.TYPE_PLACEMENT_BASE) {
    args.push(`${env.TYPE_PLACEMENT_BASE}...HEAD`);
  } else {
    // The default remains useful for an explicit local check. CI sets an
    // explicit base ref so the same guard checks the complete pull request
    // diff.
    args.push('HEAD');
  }

  // The guard only evaluates application/package source files. Restricting the
  // git diff to those trees keeps large docs, fixtures, and generated assets
  // from exhausting the child-process buffer before the parser runs.
  args.push('--', 'apps', 'packages');
  return args;
}

function getDiff() {
  // Large release or migration pull requests can exceed Node's 1 MiB default
  // child-process buffer before the guard has a chance to inspect the diff.
  // Keep the guard deterministic while allowing the complete PR diff through.
  return execFileSync('git', buildDiffArgs(), {
    encoding: 'utf8',
    maxBuffer: DIFF_MAX_BUFFER,
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  let diff;
  try {
    diff = getDiff();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `Type placement guard could not read the git diff: ${message}`,
    );
    process.exitCode = 1;
  }

  if (diff !== undefined) {
    const violations = findTypePlacementViolations(diff);

    if (violations.length > 0) {
      console.error(
        'Type placement guard failed. Move new declarations into a dedicated types module:',
      );
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
}
