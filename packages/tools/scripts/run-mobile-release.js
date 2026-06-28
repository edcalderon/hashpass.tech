#!/usr/bin/env node
/* global __dirname, process */

const { runEas } = require('./run-mobile-eas');
const { runFastlane, runFastlanePromote } = require('./run-mobile-fastlane');

const DEFAULT_RELEASE_ENV = 'production';
const DEFAULT_RELEASE_BACKEND = 'fastlane';
const PRODUCTION_PROFILE = 'production';
const DEVELOPMENT_PROFILE = 'preview';
const VALID_RELEASE_BACKENDS = new Set(['eas', 'fastlane']);

function normalizeReleaseEnvironment(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_RELEASE_ENV;
  }

  if (normalized === 'production' || normalized === 'prod') {
    return 'production';
  }

  if (normalized === 'development' || normalized === 'dev' || normalized === 'preview') {
    return 'development';
  }

  throw new Error(`Unsupported mobile release environment: ${value}`);
}

function normalizeReleaseBackend(value) {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_RELEASE_BACKEND;
  }

  if (normalized === 'expo') {
    return 'eas';
  }

  if (normalized === 'local') {
    return 'fastlane';
  }

  if (!VALID_RELEASE_BACKENDS.has(normalized)) {
    throw new Error(`Unsupported mobile release backend: ${value}`);
  }

  return normalized;
}

function parseReleaseArgs(argv = []) {
  const options = {
    env:
      process.env.EAS_RELEASE_ENV ||
      process.env.BUILD_ENV ||
      process.env.EAS_BUILD_PROFILE ||
      DEFAULT_RELEASE_ENV,
    profile: null,
    submit: true,
    backend:
      process.env.MOBILE_RELEASE_BACKEND ||
      process.env.EAS_RELEASE_BACKEND ||
      process.env.MOBILE_BUILD_BACKEND ||
      DEFAULT_RELEASE_BACKEND,
    track: process.env.MOBILE_RELEASE_TRACK || null,
    promoteTo:
      process.env.MOBILE_RELEASE_PROMOTE_TO ||
      process.env.FASTLANE_TRACK_PROMOTE_TO ||
      null,
    releaseStatus:
      process.env.FASTLANE_RELEASE_STATUS ||
      process.env.MOBILE_RELEASE_RELEASE_STATUS ||
      null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--env' && argv[i + 1]) {
      options.env = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--env=')) {
      options.env = arg.split('=')[1];
      continue;
    }

    if (arg === '--profile' && argv[i + 1]) {
      options.profile = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--profile=')) {
      options.profile = arg.split('=')[1];
      continue;
    }

    if (arg === '--backend' && argv[i + 1]) {
      options.backend = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--backend=')) {
      options.backend = arg.split('=')[1];
      continue;
    }

    if (arg === '--release-backend' && argv[i + 1]) {
      options.backend = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--release-backend=')) {
      options.backend = arg.split('=')[1];
      continue;
    }

    if (arg === '--track' && argv[i + 1]) {
      options.track = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--track=')) {
      options.track = arg.split('=')[1];
      continue;
    }

    if (arg === '--promote-to' && argv[i + 1]) {
      options.promoteTo = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--promote-to=')) {
      options.promoteTo = arg.split('=')[1];
      continue;
    }

    if (arg === '--release-status' && argv[i + 1]) {
      options.releaseStatus = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith('--release-status=')) {
      options.releaseStatus = arg.split('=')[1];
      continue;
    }

    if (arg === '--no-submit') {
      options.submit = false;
      continue;
    }

    if (arg === '--submit' || arg === '--auto-submit') {
      options.submit = true;
    }
  }

  return {
    ...options,
    env: normalizeReleaseEnvironment(options.env),
    backend: normalizeReleaseBackend(options.backend),
    profile: options.profile ? String(options.profile).trim().toLowerCase() : null,
    track: options.track ? String(options.track).trim().toLowerCase() : null,
    promoteTo: options.promoteTo ? String(options.promoteTo).trim().toLowerCase() : null,
    releaseStatus: options.releaseStatus ? String(options.releaseStatus).trim().toLowerCase() : null,
  };
}

function resolveReleaseProfile({ env = DEFAULT_RELEASE_ENV, profile } = {}) {
  if (profile) {
    return profile;
  }

  return env === 'production' ? PRODUCTION_PROFILE : DEVELOPMENT_PROFILE;
}

function buildReleaseArgs(options = {}) {
  const env = normalizeReleaseEnvironment(options.env);
  const profile = resolveReleaseProfile({ env, profile: options.profile });
  const args = ['build', '--platform', 'android', '--profile', profile];

  if (options.submit !== false) {
    args.push('--auto-submit');
  }

  return args;
}

function runRelease(options = {}) {
  const backend = normalizeReleaseBackend(options.backend);
  const profile = resolveReleaseProfile({ env: options.env, profile: options.profile });

  if (backend === 'fastlane') {
    if (options.promoteTo) {
      return runFastlanePromote({
        profile,
        track: options.track || undefined,
        promoteTo: options.promoteTo,
        releaseStatus: options.releaseStatus || undefined,
      });
    }

    return runFastlane({
      profile,
      track: options.track || undefined,
      submit: options.submit !== false,
      releaseStatus: options.releaseStatus || undefined,
    });
  }

  if (options.promoteTo) {
    throw new Error('Promotion-only releases are only supported with the fastlane backend.');
  }

  return runEas(buildReleaseArgs({ ...options, profile }), { profile });
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        'Usage: node packages/tools/scripts/run-mobile-release.js [--env production|development] [--profile eas-profile] [--backend eas|fastlane] [--track play-track] [--promote-to play-track] [--release-status draft|completed|halted|inProgress] [--no-submit]',
        '',
        'Defaults to a production-profile release using fastlane, but the current freeze expects development/internal or development/alpha releases.',
        'Use --env development to target the development Expo account and internal preview profile while production is paused.',
        'Use --backend fastlane with --promote-to alpha, --env development, and --track internal to promote the internal Play release into closed testing.',
        'Use --release-status draft when the Play app is still in draft for the first closed-testing upload.',
        'Use --backend eas only if you explicitly want the managed Expo build path.',
        'Use --backend fastlane to build locally with Expo prebuild + fastlane supply.',
      ].join('\n'),
    );
    process.exit(0);
  }

  try {
    const options = parseReleaseArgs(argv);
    const result = runRelease(options);

    if (result && result.error) {
      console.error(result.error.message);
      process.exit(1);
    }

    if (result && result.signal) {
      process.kill(process.pid, result.signal);
    }

    if (result && typeof result.status === 'number') {
      process.exit(result.status);
    }

    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_RELEASE_ENV,
  DEFAULT_RELEASE_BACKEND,
  PRODUCTION_PROFILE,
  DEVELOPMENT_PROFILE,
  VALID_RELEASE_BACKENDS,
  normalizeReleaseEnvironment,
  normalizeReleaseBackend,
  parseReleaseArgs,
  resolveReleaseProfile,
  buildReleaseArgs,
  runRelease,
  main,
};
