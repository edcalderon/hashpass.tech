#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');
const MOBILE_APP_TSCONFIG = path.join(ROOT_DIR, 'apps', 'mobile-app', 'tsconfig.json');
const PNPM_BIN = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    return null;
  }

  return (result.stdout || '').trim();
}

function resolveBaseCommit(explicitBase) {
  const refs = [];

  if (explicitBase) {
    refs.push(explicitBase);
  }

  refs.push('@{u}', 'origin/main', 'origin/develop', 'main', 'develop');

  for (const ref of refs) {
    const base = runGit(['merge-base', 'HEAD', ref]);
    if (base) {
      return base;
    }
  }

  const parent = runGit(['rev-parse', 'HEAD~1']);
  if (parent) {
    return parent;
  }

  throw new Error('Unable to determine a base commit for typechecking.');
}

function collectPaths(output, files) {
  if (!output) return;

  for (const line of output.split('\n')) {
    const filePath = line.trim();
    if (filePath) files.add(filePath);
  }
}

function getChangedFiles(baseCommit) {
  const files = new Set();

  collectPaths(runGit(['diff', '--name-only', '--diff-filter=ACMR', `${baseCommit}...HEAD`]), files);
  collectPaths(runGit(['diff', '--name-only', '--cached', '--diff-filter=ACMR']), files);
  collectPaths(runGit(['diff', '--name-only', '--diff-filter=ACMR']), files);
  collectPaths(runGit(['ls-files', '--others', '--exclude-standard']), files);

  return Array.from(files).sort();
}

function isTypeScriptFile(filePath) {
  return /\.(tsx?|d\.ts)$/.test(filePath);
}

function isRelativeSpecifier(specifier) {
  return specifier.startsWith('.') || specifier.startsWith('/');
}

function escapeForRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadLocalSpecifierMatchers(tsconfigPath) {
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const config = JSON.parse(raw);
  const paths = config?.compilerOptions?.paths ?? {};

  return Object.keys(paths).map((pattern) => {
    const escaped = escapeForRegExp(pattern).replace(/\\\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });
}

function isLocalSpecifier(specifier, matchers) {
  if (isRelativeSpecifier(specifier)) {
    return true;
  }

  return matchers.some((matcher) => matcher.test(specifier));
}

function splitTopLevelCommaList(value) {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseImportClause(clause, isTypeOnly) {
  const result = {
    defaultImport: '',
    namedValueImports: new Set(),
    namedTypeImports: new Set(),
    namespaceImport: '',
  };

  let remaining = clause.trim();
  if (!remaining) return result;

  const namespaceMatch = remaining.match(/^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (namespaceMatch) {
    result.namespaceImport = namespaceMatch[1];
    return result;
  }

  let defaultPart = '';
  if (!remaining.startsWith('{')) {
    const commaIndex = remaining.indexOf(',');
    if (commaIndex === -1) {
      defaultPart = remaining.trim();
      remaining = '';
    } else {
      defaultPart = remaining.slice(0, commaIndex).trim();
      remaining = remaining.slice(commaIndex + 1).trim();
    }
  }

  if (defaultPart) {
    const defaultName = defaultPart.replace(/^type\s+/, '').trim();
    if (isTypeOnly || defaultPart.startsWith('type ')) {
      result.namedTypeImports.add(defaultName);
    } else {
      result.defaultImport = defaultName;
    }
  }

  const namedMatch = remaining.match(/^\{([\s\S]*)\}$/);
  if (!namedMatch) {
    return result;
  }

  for (const entry of splitTopLevelCommaList(namedMatch[1])) {
    let spec = entry;
    let isNamedType = isTypeOnly;

    if (spec.startsWith('type ')) {
      isNamedType = true;
      spec = spec.slice(5).trim();
    }

    const aliasParts = spec.split(/\s+as\s+/);
    const localName = (aliasParts[1] || aliasParts[0]).trim();

    if (!localName) continue;

    if (isNamedType) {
      result.namedTypeImports.add(localName);
    } else {
      result.namedValueImports.add(localName);
    }
  }

  return result;
}

function collectImportSpecifiers(content) {
  const imports = [];
  const importRegex = /^\s*import\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  const sideEffectRegex = /^\s*import\s+['"]([^'"]+)['"];?/gm;

  for (const match of content.matchAll(importRegex)) {
    imports.push({
      specifier: match[3],
      clause: match[2],
      isTypeOnly: Boolean(match[1]),
    });
  }

  for (const match of content.matchAll(sideEffectRegex)) {
    imports.push({
      specifier: match[1],
      clause: '',
      isTypeOnly: false,
    });
  }

  return imports;
}

function resolveTempModulePath(tempBaseDir, sourceFilePath, specifier) {
  const sourceDir = isRelativeSpecifier(specifier)
    ? path.dirname(sourceFilePath)
    : tempBaseDir;
  const resolved = path.resolve(sourceDir, specifier);

  if (resolved.endsWith('.d.ts')) {
    return resolved;
  }

  return `${resolved}.d.ts`;
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function linkNodeModules(sourceDir, targetDir) {
  const source = path.join(sourceDir, 'node_modules');
  const target = path.join(targetDir, 'node_modules');

  if (!fs.existsSync(source) || fs.existsSync(target)) {
    return;
  }

  ensureParentDir(target);
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(source, target, linkType);
}

function writeStubModule(stubPath, stubInfo) {
  const lines = ['/* eslint-disable @typescript-eslint/no-explicit-any */'];

  if (stubInfo.defaultImport) {
    lines.push(`declare const ${stubInfo.defaultImport}: any;`);
    lines.push(`export default ${stubInfo.defaultImport};`);
  }

  for (const name of stubInfo.namedClassImports) {
    // Class stub: usable as a constructor (new X()) and as a type annotation (field: X).
    lines.push(`export declare class ${name} { constructor(...args: any[]); [key: string]: any; static [key: string]: any; }`);
  }

  for (const name of stubInfo.namedValueImports) {
    // `any` is callable, constructable, and allows property access — safe for objects,
    // functions, and mixed-use imports. Type-position usage must use `import type`.
    lines.push(`export declare const ${name}: any;`);
  }

  for (const name of stubInfo.namedTypeImports) {
    if (stubInfo.namedValueImports.has(name)) continue;
    if (stubInfo.namedClassImports.has(name)) continue;
    lines.push(`export type ${name} = any;`);
  }

  if (!stubInfo.defaultImport && stubInfo.namedValueImports.size === 0 && stubInfo.namedClassImports.size === 0 && stubInfo.namedTypeImports.size === 0) {
    lines.push('export {};');
  }

  lines.push('');
  ensureParentDir(stubPath);
  fs.writeFileSync(stubPath, `${lines.join('\n')}\n`);
}

function parseArgs(argv) {
  const options = {
    base: '',
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--base' && argv[i + 1]) {
      options.base = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }

    if (arg.startsWith('--base=')) {
      options.base = String(arg.split('=')[1]).trim();
      continue;
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      'Usage:',
      '  node packages/tools/scripts/typecheck-changed.mjs [--base <ref>]',
      '',
      'Checks the TypeScript files changed on this branch against apps/mobile-app/tsconfig.json.',
      'By default it diffs HEAD against the best available upstream or main/develop fallback.',
    ].join('\n'),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const baseCommit = resolveBaseCommit(options.base || '');
  // apps/web-app uses its own Next.js tsconfig; skip it here to avoid false positives
  // when web-app files are untracked or changed alongside mobile/packages work.
  const changedFiles = getChangedFiles(baseCommit)
    .filter(isTypeScriptFile)
    .filter(f => !f.startsWith('apps/web-app/') && !f.startsWith('apps/docs/'));
  const localSpecifierMatchers = loadLocalSpecifierMatchers(MOBILE_APP_TSCONFIG);

  if (changedFiles.length === 0) {
    console.log('No changed or uncommitted TypeScript files to typecheck.');
    return;
  }

  const scratchRoot = path.join(ROOT_DIR, '.tmp');
  fs.mkdirSync(scratchRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(scratchRoot, 'hashpass-typecheck-'));
  linkNodeModules(ROOT_DIR, tempDir);
  linkNodeModules(path.join(ROOT_DIR, 'apps', 'mobile-app'), path.join(tempDir, 'apps', 'mobile-app'));
  const tempBaseDir = path.join(tempDir, 'apps', 'mobile-app');
  const tempTsconfigPath = path.join(tempDir, 'tsconfig.json');
  const tempBuildInfoPath = path.join(tempDir, 'tsconfig.tsbuildinfo');
  const files = [];
  const stubModules = new Map();

  for (const filePath of changedFiles) {
    const sourceFilePath = path.join(ROOT_DIR, filePath);
    const tempFilePath = path.join(tempDir, filePath);
    ensureParentDir(tempFilePath);
    fs.copyFileSync(sourceFilePath, tempFilePath);
    files.push(path.relative(tempDir, tempFilePath));

    const content = fs.readFileSync(sourceFilePath, 'utf8');
    const imports = collectImportSpecifiers(content);

    for (const spec of imports) {
      if (!isLocalSpecifier(spec.specifier, localSpecifierMatchers)) {
        continue;
      }

      const stubPath = resolveTempModulePath(tempBaseDir, tempFilePath, spec.specifier);
      if (!stubModules.has(stubPath)) {
        stubModules.set(stubPath, {
          defaultImport: '',
          namedValueImports: new Set(),
          namedClassImports: new Set(),
          namedTypeImports: new Set(),
        });
      }

      const stubInfo = stubModules.get(stubPath);
      const parsed = parseImportClause(spec.clause, spec.isTypeOnly);

      if (parsed.defaultImport) {
        stubInfo.defaultImport = parsed.defaultImport;
      }

      if (parsed.namespaceImport) {
        stubInfo.defaultImport = parsed.namespaceImport;
      }

      for (const name of parsed.namedValueImports) {
        // If this file uses `new Name(` it's a class; generate a class stub so the name
        // can be used as both a constructor and a type annotation. Otherwise generate a
        // function stub so it can be called directly without `new`.
        const isClassUsage = new RegExp(`\\bnew\\s+${name}\\s*[<(]`).test(content);
        if (isClassUsage) {
          stubInfo.namedClassImports.add(name);
        } else {
          stubInfo.namedValueImports.add(name);
        }
      }

      for (const name of parsed.namedTypeImports) {
        stubInfo.namedTypeImports.add(name);
      }
    }
  }

  for (const [stubPath, stubInfo] of stubModules.entries()) {
    writeStubModule(stubPath, stubInfo);
  }

  // Copy global type augmentation files so that module augmentations (dataSet, className, etc.)
  // are available even when `include` is empty in the temp tsconfig.
  const typesSourceDir = path.join(ROOT_DIR, 'apps', 'mobile-app', 'types');
  const typesDestDir = path.join(tempBaseDir, 'types');
  if (fs.existsSync(typesSourceDir)) {
    fs.mkdirSync(typesDestDir, { recursive: true });
    for (const entry of fs.readdirSync(typesSourceDir)) {
      if (entry.endsWith('.d.ts')) {
        const src = path.join(typesSourceDir, entry);
        const dest = path.join(typesDestDir, entry);
        fs.copyFileSync(src, dest);
        files.push(path.relative(tempDir, dest));
      }
    }
  }

  const tempConfig = {
    extends: MOBILE_APP_TSCONFIG,
    compilerOptions: {
      noEmit: true,
      incremental: false,
      skipLibCheck: true,
      tsBuildInfoFile: tempBuildInfoPath,
      baseUrl: tempBaseDir,
      paths: {},
    },
    files,
    include: [],
  };

  fs.writeFileSync(tempTsconfigPath, `${JSON.stringify(tempConfig, null, 2)}\n`);

  console.log(`Typechecking ${changedFiles.length} changed TypeScript file(s) from ${baseCommit}...HEAD`);

  const result = spawnSync(PNPM_BIN, ['exec', 'tsc', '--noEmit', '-p', tempTsconfigPath], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });

  fs.rmSync(tempDir, { recursive: true, force: true });

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 0);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
