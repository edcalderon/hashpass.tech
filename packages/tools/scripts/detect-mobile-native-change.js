#!/usr/bin/env node
/* global __dirname, process, console */

// Decides whether a mobile change needs a real native build
// (mobile-android-release.yml) or is safe to ship as a JS-only OTA update
// instead (mobile-eas-update.yml). See
// apps/docs/docs/reference/mobile-app/eas-update-ota.md for the full design.
//
// Used from two different callers, at two different diff granularities:
//   - mobile-release-on-tag.yml: --tag <newTag>, diffs against the previous
//     release tag. Decides whether the tag-triggered internal/alpha/beta
//     native chain should run at all.
//   - mobile-eas-update.yml: --from <sha> --to <sha>, diffs a single push's
//     commit range. Decides whether THIS push is safe to publish as an OTA
//     update, or whether native code changed in the same push (in which case
//     publishing JS-only would ship JS that calls into a native module old
//     installed binaries don't have yet -- publishing must be skipped, not
//     just left to the separate native-build decision, which ships on its
//     own slower timeline).
//
// package.json (root + apps/mobile-app) and apps/mobile-app/app.json get a
// *structural* diff instead of a raw whole-file diff: the release version
// bump (packages/tools/scripts/update-version.mjs, driven by
// versioning.config.json's syncFiles) rewrites package.json's "version" and
// app.json's expo.version/expo.android.versionCode on every single release.
// A raw diff on those files would therefore always report "changed" and
// make this guard permanently useless -- so those two known auto-bumped
// slices are stripped out before comparing.

const { execSync } = require('child_process');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../../..');
const NULL_SHA = '0000000000000000000000000000000000000000';

// Any diff under these paths means a real native build is required -- none
// of them contain a field the release-version-bump script touches, so a raw
// path-based diff is safe.
const NATIVE_SENSITIVE_PATH_PREFIXES = [
  'apps/mobile-app/android/',
  'apps/mobile-app/ios/',
  'apps/mobile-app/plugins/',
  'apps/mobile-app/fastlane/',
  // Root pnpm.patchedDependencies patches (package.json) -- these patch
  // native RN/Expo packages in place (react-native, react-native-svg,
  // react-native-screens, etc: see patches/mobile-app/*.patch and
  // patches/shared/*.patch, split by scope 2026-08-14, plus package.json's
  // pnpm.patchedDependencies), so a patch edit changes native behavior
  // without necessarily touching apps/mobile-app/package.json's own
  // dependencies object. mobile-android-release.yml's own Gradle cache key
  // already hashes patches/*/*.patch alongside pnpm-lock.yaml for exactly
  // this reason.
  'patches/',
];

const NATIVE_SENSITIVE_EXACT_FILES = [
  'apps/mobile-app/app.config.js',
  'apps/mobile-app/eas.json',
  'apps/mobile-app/fingerprint.config.js',
  'apps/mobile-app/Gemfile',
  'apps/mobile-app/Gemfile.lock',
  'apps/mobile-app/config/google-services.json',
  'apps/mobile-app/config/amplifyconfiguration.json',
  'apps/mobile-app/react-native.config.js',
  // Referenced directly by app.json (expo.icon, expo.android.adaptiveIcon.
  // foregroundImage) and baked into native launcher resources (mipmap
  // drawables) at prebuild time. app.json's own structural diff only
  // catches a changed *path* string, not the referenced image's bytes
  // changing at the same path -- OTA cannot update an installed launcher
  // icon, so these need their own explicit check.
  'apps/mobile-app/assets/images/icon.png',
  'apps/mobile-app/assets/images/adaptive-icon.png',
];

// Structurally diffed instead of raw-diffed -- see header comment.
const DEPENDENCY_FILES = ['package.json', 'apps/mobile-app/package.json'];
const APP_JSON_PATH = 'apps/mobile-app/app.json';
const APP_JSON_IGNORED_KEYS = ['expo.version', 'expo.android.versionCode'];

function refExists(ref) {
  try {
    execSync(`git cat-file -e ${ref}^{commit}`, { cwd: ROOT_DIR, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readAtRef(ref, relPath) {
  try {
    return execSync(`git show ${ref}:${relPath}`, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return null; // file didn't exist at that ref
  }
}

// Descending version order, so whatever comes immediately after currentTag
// in this list is the true previous release -- not just "first other tag",
// which would be wrong if currentTag isn't actually the newest tag (e.g.
// when this is invoked manually against an older tag for testing).
function getPreviousTag(currentTag) {
  const tags = execSync("git tag --list 'v*.*.*' --sort=-v:refname", {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  })
    .split('\n')
    .map((tag) => tag.trim())
    .filter(Boolean);

  const currentIndex = tags.indexOf(currentTag);

  if (currentIndex === -1) {
    // currentTag isn't a known tag yet -- fall back to the newest known tag.
    return tags[0] || null;
  }

  return tags[currentIndex + 1] || null;
}

function diffChangedPaths(fromRef, toRef) {
  return execSync(`git diff --name-only ${fromRef} ${toRef}`, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  })
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean);
}

function omitPath(source, dottedKey) {
  const keys = dottedKey.split('.');
  const clone = JSON.parse(JSON.stringify(source || {}));
  let cursor = clone;

  for (let i = 0; i < keys.length - 1; i += 1) {
    if (cursor == null || typeof cursor !== 'object') {
      return clone;
    }
    cursor = cursor[keys[i]];
  }

  if (cursor && typeof cursor === 'object') {
    delete cursor[keys[keys.length - 1]];
  }

  return clone;
}

function dependenciesChanged(fromRef, toRef, relPath) {
  const fromRaw = readAtRef(fromRef, relPath);
  const toRaw = readAtRef(toRef, relPath);

  if (fromRaw === null || toRaw === null) {
    return fromRaw !== toRaw; // file added or removed -- treat as real change
  }

  const from = JSON.parse(fromRaw);
  const to = JSON.parse(toRaw);
  const fromDeps = JSON.stringify({
    dependencies: from.dependencies || {},
    devDependencies: from.devDependencies || {},
  });
  const toDeps = JSON.stringify({
    dependencies: to.dependencies || {},
    devDependencies: to.devDependencies || {},
  });

  return fromDeps !== toDeps;
}

function appJsonChanged(fromRef, toRef, relPath) {
  const fromRaw = readAtRef(fromRef, relPath);
  const toRaw = readAtRef(toRef, relPath);

  if (fromRaw === null || toRaw === null) {
    return fromRaw !== toRaw;
  }

  let from = JSON.parse(fromRaw);
  let to = JSON.parse(toRaw);

  for (const key of APP_JSON_IGNORED_KEYS) {
    from = omitPath(from, key);
    to = omitPath(to, key);
  }

  return JSON.stringify(from) !== JSON.stringify(to);
}

// Core: diffs two arbitrary refs and reports whether anything native-
// sensitive changed between them. Assumes both refs are already known to
// exist -- callers decide what "can't tell" means for their own use case
// (see resolvable:false handling in detectForTagRelease/detectForPushRange).
function detectBetweenRefs(fromRef, toRef) {
  const reasons = [];
  const changedPaths = diffChangedPaths(fromRef, toRef);

  for (const prefix of NATIVE_SENSITIVE_PATH_PREFIXES) {
    for (const changed of changedPaths) {
      if (changed.startsWith(prefix)) {
        reasons.push(changed);
      }
    }
  }

  for (const file of NATIVE_SENSITIVE_EXACT_FILES) {
    if (changedPaths.includes(file)) {
      reasons.push(file);
    }
  }

  for (const file of DEPENDENCY_FILES) {
    if (changedPaths.includes(file) && dependenciesChanged(fromRef, toRef, file)) {
      reasons.push(`${file} (dependencies changed)`);
    }
  }

  if (changedPaths.includes(APP_JSON_PATH) && appJsonChanged(fromRef, toRef, APP_JSON_PATH)) {
    reasons.push(`${APP_JSON_PATH} (native config changed, not just version/versionCode)`);
  }

  return {
    resolvable: true,
    needsNative: reasons.length > 0,
    reasons,
  };
}

// Release-tag granularity. No previous tag to diff against (first-ever
// release) is treated as "needs native" -- can't verify safety, and a
// missing native build is the worse failure mode for an actual release.
function detectForTagRelease(currentTag) {
  const previousTag = getPreviousTag(currentTag);

  if (!previousTag) {
    return {
      resolvable: false,
      needsNative: true,
      previousTag: null,
      reasons: ['No previous release tag found to diff against -- defaulting to a full native release.'],
    };
  }

  return { previousTag, ...detectBetweenRefs(previousTag, currentTag) };
}

// Single-push granularity, driven by the push event's before/after SHAs.
// An unresolvable range (new branch's first push, force-push, shallow
// history) is treated as "can't verify" -- for a single OTA publish the
// safe default is to SKIP publishing, not to force anything, since skipping
// just means this push's JS ships on the next push that IS verifiable
// instead of shipping something unverified right now.
function detectForPushRange(fromRef, toRef) {
  if (!fromRef || !toRef || fromRef === NULL_SHA || !refExists(fromRef) || !refExists(toRef)) {
    return {
      resolvable: false,
      needsNative: null,
      reasons: [`Unresolvable commit range (from=${fromRef || '<none>'} to=${toRef || '<none>'}) -- skipping OTA publish for this push rather than guessing.`],
    };
  }

  return detectBetweenRefs(fromRef, toRef);
}

function parseArgs(argv) {
  const args = { tag: null, from: null, to: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') {
      args.tag = argv[i + 1];
      i += 1;
    } else if (arg === '--from') {
      args.from = argv[i + 1];
      i += 1;
    } else if (arg === '--to') {
      args.to = argv[i + 1];
      i += 1;
    }
  }

  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let result;

  if (args.tag) {
    result = detectForTagRelease(args.tag);
  } else if (args.from !== null || args.to !== null) {
    result = detectForPushRange(args.from, args.to || 'HEAD');
  } else {
    console.error('Usage: detect-mobile-native-change.js --tag <tag> | --from <sha> --to <sha>');
    process.exit(2);
    return;
  }

  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = {
  detectBetweenRefs,
  detectForTagRelease,
  detectForPushRange,
  getPreviousTag,
  diffChangedPaths,
  dependenciesChanged,
  appJsonChanged,
  NATIVE_SENSITIVE_PATH_PREFIXES,
  NATIVE_SENSITIVE_EXACT_FILES,
  DEPENDENCY_FILES,
  APP_JSON_PATH,
};
