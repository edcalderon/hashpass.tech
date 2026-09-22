#!/usr/bin/env node

/**
 * Native fetch guard — prevents raw `fetch()` calls with relative URL paths
 * from reaching the mobile app.
 *
 * React Native's `fetch` has no implicit base URL. A call like
 *   fetch('/api/status')
 * throws a synchronous `TypeError: Invalid URL` on native (crashing the
 * entire screen), while resolving fine on web against `document.location`.
 *
 * The correct cross-platform path is `apiClient.request()` from
 * `lib/api-client.ts`, which resolves the full URL on both platforms.
 *
 * This script scans `apps/mobile-app` source and flags any `fetch(...)`
 * call whose first argument is a relative path string literal (starting
 * with `/` but not `//` or `https://`), excluding:
 *   - `lib/api-client.ts` itself (the canonical safe client)
 *   - `+api.ts` route handler files (server-only code)
 *   - files under `tests/`, `*.test.*`, `*.stories.*`
 *   - `lib/server/` (server-only utilities)
 *
 * Allowed: `fetch('https://...')`, `fetch(someVariable)`, `fetch(url)`,
 *          `fetch(new URL(...))`, `fetch(\`https://...\`)`
 * Flagged: `fetch('/api/foo')`, `fetch('/status')`,
 *          `fetch(\`/api/${x}\`)`
 *
 * Add this guard to CI alongside `check:design-system`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const mobileRoot = path.join(root, 'apps/mobile-app');
const excluded = /(?:\/tests\/|\.test\.[jt]sx?$|\.stories\.[jt]sx?$|\/__tests__\/|\/api\/.*\+api\.ts$|\/lib\/server\/)/;
const allowedFiles = new Set([
  'lib/api-client.ts',
]);

// Match fetch( with first arg being a string literal starting with `/` but
// NOT `//` (protocol-relative) and NOT inside a comment.
// Captures both single/double-quoted strings and template literals.
const RELATIVE_FETCH_RE = /(?<![./a-zA-Z0-9_])fetch\s*\(\s*(?:`([^`]*?)`|'([^']+?)'|"([^"]+?)")/g;

function isRelativePath(value) {
  if (!value) return false;
  // Must start with `/` but NOT `//` (protocol-relative like `//cdn.example.com`)
  return value.startsWith('/') && !value.startsWith('//');
}

function scanFile(relativePath, source) {
  const errors = [];
  const lines = source.split('\n');
  const WEB_GUARD_RE = /Platform\.OS\s*(?:!===|!==|!=|={2,3})\s*['"]web['"]/;

  for (const [lineIndex, line] of lines.entries()) {
    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

    // Reset regex state for each line
    RELATIVE_FETCH_RE.lastIndex = 0;
    let match;
    while ((match = RELATIVE_FETCH_RE.exec(line)) !== null) {
      const value = match[1] ?? match[2] ?? match[3];
      if (isRelativePath(value)) {
        // Check if this line is inside a Platform.OS === 'web' guard block.
        // Look back up to 10 lines for a web-only guard pattern.
        let isWebGuarded = false;
        for (let back = Math.max(0, lineIndex - 10); back < lineIndex; back++) {
          if (WEB_GUARD_RE.test(lines[back])) {
            isWebGuarded = true;
            break;
          }
        }
        if (!isWebGuarded) {
          errors.push({
            file: relativePath,
            line: lineIndex + 1,
            column: match.index + 1,
            value,
            context: line.trim(),
          });
        }
      }
    }
  }

  return errors;
}

function walk(dir, relativeBase = '', results = []) {
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir).sort()) {
    const fullPath = path.join(dir, entry);
    const relativePath = relativeBase ? `${relativeBase}/${entry}` : entry;

    if (fs.statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === '.expo' || entry === 'ios' || entry === 'android' || entry === '.tmp') {
        continue;
      }
      walk(fullPath, relativePath, results);
    } else if (/\.[jt]sx?$/.test(entry) && !excluded.test(relativePath)) {
      results.push(relativePath);
    }
  }

  return results;
}

function main() {
  const files = walk(mobileRoot);
  const allErrors = [];

  for (const relativePath of files) {
    if (allowedFiles.has(relativePath)) continue;

    const fullPath = path.join(mobileRoot, relativePath);
    const source = fs.readFileSync(fullPath, 'utf8');
    const errors = scanFile(relativePath, source);
    allErrors.push(...errors);
  }

  if (allErrors.length) {
    const lines = allErrors.map(
      (e) =>
        `  ${e.file}:${e.line}:${e.column} — fetch("${e.value}")\n    ${e.context}`,
    );
    process.stderr.write(
      `Native fetch guard failed — raw fetch() with a relative URL path will crash on React Native:\n\n${lines.join('\n')}\n\n` +
        `Fix: use \`apiClient.request()\` from \`lib/api-client.ts\` instead, which resolves\n` +
        `the full URL on both web and native. See the existing pattern in \`app/status.tsx\`.\n`,
    );
    process.exit(1);
  }

  console.log('Native fetch guard passed — no raw relative fetch() calls found.');
}

main();
