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

  // `git diff --name-only` reports both sides of a rename. Deleted source
  // paths cannot be copied into the isolated typecheck workspace, and they
  // no longer need validation; keep the destination path instead.
  return Array.from(files)
    .filter((filePath) => fs.existsSync(path.join(ROOT_DIR, filePath)))
    .sort();
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

// Mirrors tsconfig.json's compilerOptions.paths entries (e.g. "@/*": ["./*"],
// "@hashpass/auth": ["../../packages/auth/src"]) so a stub for an aliased
// specifier lands at the same physical location TypeScript's own paths-based
// resolution would look for it — not a literal "@" folder. Each pattern has
// at most one '*' in this repo, matching TS's own single-wildcard rule.
function loadPathAliasEntries(tsconfigPath) {
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const config = JSON.parse(raw);
  const paths = config?.compilerOptions?.paths ?? {};

  return Object.entries(paths).map(([pattern, targets]) => {
    const target = Array.isArray(targets) ? targets[0] : targets;
    const starIndex = pattern.indexOf('*');
    return { pattern, target, starIndex };
  });
}

function resolveAliasTarget(specifier, aliasEntries) {
  for (const { pattern, target, starIndex } of aliasEntries) {
    if (starIndex === -1) {
      if (specifier === pattern) return target;
      continue;
    }

    const prefix = pattern.slice(0, starIndex);
    const suffix = pattern.slice(starIndex + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    if (specifier.length < prefix.length + suffix.length) continue;

    const captured = specifier.slice(prefix.length, specifier.length - suffix.length);
    return target.replaceAll('*', captured);
  }

  return null;
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
  // Clause group handles both single-line and multi-line imports:
  // - Braced form (possibly multi-line): import { Foo,\n  Bar } from '...'
  // - Simple form (single line):         import Foo from '...'
  // [^}]* intentionally matches newlines so { } spans can cross lines.
  // [^\n]*? keeps each alternative anchored to a single line for the
  // prefix/suffix, preventing merging across unrelated import statements.
  const importRegex = /^\s*import\s+(type\s+)?([^\n]*?\{[^}]*\}[^\n]*?|[^\n]*?)\s+from\s+['"]([^'"]+)['"];?/gm;
  const sideEffectRegex = /^\s*import\s+['"]([^'"]+)['"];?/gm;
  // Dynamic import() calls (e.g. `const { X } = await import("./foo.js")`)
  // aren't caught by the static-import regexes above, so a changed file
  // using one (like sst.config.ts's conditional target-specific config
  // loading) would have its dependency silently missing from the isolated
  // typecheck sandbox — producing a "Cannot find module" false positive
  // unrelated to any real type error in the changed file. Captures the
  // destructuring clause (if any) the same way the static-import regex
  // does, so the generated stub module still declares the right names.
  const dynamicImportRegex =
    /\b(?:const|let|var)\s+(\{[^}]*\})\s*=\s*(?:await\s+)?import\(\s*['"]([^'"]+)['"]\s*\)/g;

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

  for (const match of content.matchAll(dynamicImportRegex)) {
    imports.push({
      specifier: match[2],
      clause: match[1],
      isTypeOnly: false,
    });
  }

  return imports;
}

function resolveTempModulePath(tempBaseDir, sourceFilePath, specifier, aliasEntries) {
  let resolved;
  if (isRelativeSpecifier(specifier)) {
    resolved = path.resolve(path.dirname(sourceFilePath), specifier);
  } else {
    // Non-relative specifiers are only reached here when isLocalSpecifier()
    // matched one of tsconfig's paths patterns, so this should always find a
    // target; the raw specifier is a defensive fallback, not an expected path.
    const aliasTarget = resolveAliasTarget(specifier, aliasEntries) ?? specifier;
    resolved = path.resolve(tempBaseDir, aliasTarget);
  }

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
  // If the aliased import target is itself one of the changed files, it was
  // already copied into the sandbox with its real types intact — a stub at
  // the same resolved location would create an ambiguous duplicate module
  // (and silently mask the real file's types behind an `any` stub). Skip it.
  const basePath = stubPath.replace(/\.d\.ts$/, '');
  if (fs.existsSync(`${basePath}.ts`) || fs.existsSync(`${basePath}.tsx`)) {
    return;
  }

  const lines = ['/* eslint-disable @typescript-eslint/no-explicit-any */'];

  if (stubInfo.defaultImport) {
    lines.push(`declare const ${stubInfo.defaultImport}: any;`);
    lines.push(`export default ${stubInfo.defaultImport};`);
  }

  for (const name of stubInfo.namedClassImports) {
    // Class stub: usable as a constructor (new X()) and as a type annotation (field: X).
    lines.push(`export declare class ${name} { constructor(...args: any[]); [key: string]: any; static [key: string]: any; }`);
  }

  // A plain (non-`type`-prefixed) named import gives no reliable signal about
  // whether the source module exports a value, a type, or both — e.g.
  // `import { MeetingRequest } from '../types'` where MeetingRequest is
  // actually an `interface`, used only in type positions in this file.
  // Emitting only a `const: any` stub then fails with "X refers to a value,
  // but is being used as a type here" the moment the consuming file uses it
  // as a type. Values and types live in separate namespaces in TypeScript,
  // so declaring both under the same name is legal and covers every usage
  // shape without needing to know which one the real module actually is.
  for (const name of stubInfo.namedValueImports) {
    if (stubInfo.namedClassImports.has(name)) continue;
    lines.push(`export declare const ${name}: any;`);
    lines.push(`export type ${name} = any;`);
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

// Standalone workspace packages under packages/<name> (e.g. @hashpass/sdk,
// support-widget, support-kapso) are typechecked by delegating straight to
// each package's own real tsconfig.json instead of the apps/mobile-app
// stub-sandbox below. That sandbox only knows how to synthesize stubs for
// apps/mobile-app's own "@/*" path aliases; a package/-rooted file's
// relative imports (e.g. packages/sdk/src/auth/client.ts importing
// ../transport.js) would get stubbed to `any` because the real sibling file
// wasn't independently "changed", silently degrading generics to untyped
// calls -- and a bare specifier like "@hashpass/sdk" resolves via that
// package's OWN node_modules symlink, which the sandbox never sets up. Each
// affected package's real tsconfig already resolves both correctly, so
// there's no sandbox to build for this half of the changed files at all.
function typecheckPackageFiles(packageFiles) {
  const roots = new Set();
  for (const filePath of packageFiles) {
    const segments = filePath.split('/');
    roots.add(segments.slice(0, 2).join('/')); // e.g. "packages/sdk"
  }

  let exitCode = 0;
  for (const root of Array.from(roots).sort()) {
    const tsconfigPath = path.join(ROOT_DIR, root, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      console.log(`Skipping ${root}: no tsconfig.json found.`);
      continue;
    }

    console.log(`Typechecking ${root} against its own tsconfig.json...`);
    const result = spawnSync(PNPM_BIN, ['exec', 'tsc', '--noEmit', '-p', tsconfigPath], {
      cwd: path.join(ROOT_DIR, root),
      stdio: 'inherit',
      env: process.env,
    });

    if (result.error) throw result.error;
    if (result.signal) process.kill(process.pid, result.signal);
    if ((result.status ?? 0) !== 0) exitCode = result.status;
  }

  return exitCode;
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
  // Archive trees are historical reference material and are intentionally excluded
  // so they do not block active app release preflight.
  const allChangedFiles = getChangedFiles(baseCommit)
    .filter(isTypeScriptFile)
    .filter(f => !f.startsWith('apps/web-app/') && !f.startsWith('apps/docs/') && !f.startsWith('archive/'));

  // packages/* files are checked separately below (see typecheckPackageFiles);
  // everything else keeps the original single-sandbox behavior unchanged.
  const packageFiles = allChangedFiles.filter((f) => f.startsWith('packages/'));
  const changedFiles = allChangedFiles.filter((f) => !f.startsWith('packages/'));

  const packageExitCode = packageFiles.length > 0 ? typecheckPackageFiles(packageFiles) : 0;

  const localSpecifierMatchers = loadLocalSpecifierMatchers(MOBILE_APP_TSCONFIG);
  const pathAliasEntries = loadPathAliasEntries(MOBILE_APP_TSCONFIG);

  if (changedFiles.length === 0) {
    console.log('No changed or uncommitted apps/mobile-app TypeScript files to typecheck.');
    process.exit(packageExitCode);
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

      const stubPath = resolveTempModulePath(tempBaseDir, tempFilePath, spec.specifier, pathAliasEntries);
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
      // Inherit the real "@/*"-style paths from MOBILE_APP_TSCONFIG (not
      // overridden here) so TS resolves an aliased import of another changed
      // file to that file's real (copied) types, matching resolveTempModulePath
      // below — and only falls through to a stub for genuinely unchanged deps.
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

  process.exit((result.status ?? 0) !== 0 ? result.status : packageExitCode);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
