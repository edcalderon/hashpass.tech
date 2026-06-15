#!/usr/bin/env node
/* global __dirname, process */

const { runEas } = require('./run-mobile-eas');

const DEFAULT_RELEASE_ENV = 'production';
const PRODUCTION_PROFILE = 'production';
const DEVELOPMENT_PROFILE = 'preview';

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

function parseReleaseArgs(argv = []) {
  const options = {
    env:
      process.env.EAS_RELEASE_ENV ||
      process.env.BUILD_ENV ||
      process.env.EAS_BUILD_PROFILE ||
      DEFAULT_RELEASE_ENV,
    profile: null,
    submit: true,
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
    profile: options.profile ? String(options.profile).trim().toLowerCase() : null,
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

function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      [
        'Usage: node packages/tools/scripts/run-mobile-release.js [--env production|development] [--profile eas-profile] [--no-submit]',
        '',
        'Defaults to a production release.',
        'Use --env development to target the development Expo account and internal preview profile.',
      ].join('\n'),
    );
    process.exit(0);
  }

  let result;

  try {
    const options = parseReleaseArgs(argv);
    result = runEas(buildReleaseArgs(options), { profile: options.profile || undefined });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.signal) {
    process.kill(process.pid, result.signal);
  }

  process.exit(result.status ?? 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_RELEASE_ENV,
  PRODUCTION_PROFILE,
  DEVELOPMENT_PROFILE,
  normalizeReleaseEnvironment,
  parseReleaseArgs,
  resolveReleaseProfile,
  buildReleaseArgs,
  main,
};
