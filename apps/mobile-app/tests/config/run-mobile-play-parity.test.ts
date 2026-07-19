/// <reference types="jest" />

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

jest.mock('child_process', () => ({
  spawnSync: jest.fn(() => ({ status: 0 })),
}));

jest.mock('../../../../packages/tools/scripts/run-mobile-fastlane.js', () => {
  const os = require('os');
  const path = require('path');

  return {
    ANDROID_DIR: path.join(os.tmpdir(), 'hashpass-play-parity-test-android'),
    buildFastlaneEnv: jest.fn(({ baseEnv, profile, track }) => ({
      ...baseEnv,
      CI: '1',
      EAS_BUILD_PROFILE: profile,
      FASTLANE_TRACK: track,
      MOBILE_ANDROID_VERSION_CODE: '123456',
    })),
    cleanGeneratedAndroidDir: jest.fn(),
    runExpoPrebuild: jest.fn(),
    runFastlane: jest.fn(),
  };
});

const {
  AUTH_CRITICAL_ENV_KEYS,
  WORKFLOW_MOBILE_ENV_KEYS,
  buildLocalPlayParity,
  createParityEnvFiles,
  parseParityArgs,
  redactCommandArg,
  resolveGradleSigningArgs,
  resolveLocalSigningEnv,
  resolveWorkflowMobileEnv,
} = require('../../../../packages/tools/scripts/run-mobile-play-parity.js') as {
  AUTH_CRITICAL_ENV_KEYS: string[];
  WORKFLOW_MOBILE_ENV_KEYS: string[];
  buildLocalPlayParity: (options?: {
    baseEnv?: Record<string, string>;
    releaseEnv?: string;
    track?: string;
    submit?: boolean;
    install?: boolean;
  }) => { profile: string; track: string; mobileEnv: Record<string, string> };
  createParityEnvFiles: (options: {
    sourceEnv: Record<string, string>;
    releaseEnv: string;
  }) => { tempDir: string; rootEnvPath: string; mobileEnvPath: string; mobileEnv: Record<string, string> };
  parseParityArgs: (argv?: string[]) => {
    releaseEnv: string;
    track: string;
    submit: boolean;
    install: boolean;
  };
  redactCommandArg: (arg: string) => string;
  resolveGradleSigningArgs: (sourceEnv: Record<string, string>) => string[];
  resolveLocalSigningEnv: (sourceEnv: Record<string, string>) => Record<string, string>;
  resolveWorkflowMobileEnv: (options: {
    sourceEnv: Record<string, string>;
    releaseEnv: string;
  }) => Record<string, string>;
};

describe('run-mobile-play-parity', () => {
  const developmentProjectIdFixture = 'fixture-eas-development-project-id';
  const fakeStorePassword = 'example-store-password';
  const fakeKeyPassword = 'example-key-password';

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('defaults to the published internal/alpha build shape without submitting', () => {
    expect(parseParityArgs([])).toEqual({
      releaseEnv: 'development',
      track: 'internal',
      submit: false,
      install: false,
    });
  });

  it('resolves the same auth-critical public env keys as the Play workflow', () => {
    const mobileEnv = resolveWorkflowMobileEnv({
      releaseEnv: 'development',
      sourceEnv: {
        EXPO_PUBLIC_SUPABASE_URL_DEV: 'https://dev.example.test',
        EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV: 'dev-anon',
        EXPO_PUBLIC_SUPABASE_URL_PROD: 'https://prod.example.test',
        EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD: 'prod-anon',
        EXPO_PUBLIC_DIRECTUS_URL: 'https://directus.example.test',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
        EXPO_PUBLIC_SENTRY_DSN: 'https://sentry.example.test',
        ['UNRELATED_SECRET']: 'example-must-not-be-written',
      },
    });

    expect(mobileEnv).toMatchObject({
      EXPO_PUBLIC_SUPABASE_PROFILE: 'core-development',
      EXPO_PUBLIC_SUPABASE_URL: 'https://dev.example.test',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'dev-anon',
      EXPO_PUBLIC_DIRECTUS_URL: 'https://directus.example.test',
      EXPO_PUBLIC_SITE_URL: 'https://hashpass.tech',
      EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN: 'true',
      EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
      EXPO_PUBLIC_SENTRY_DSN: 'https://sentry.example.test',
    });
    expect(Object.keys(mobileEnv).sort()).toEqual(WORKFLOW_MOBILE_ENV_KEYS.slice().sort());
    expect(AUTH_CRITICAL_ENV_KEYS.every((key) => Boolean(mobileEnv[key]))).toBe(true);
    expect(mobileEnv.UNRELATED_SECRET).toBeUndefined();
  });

  it('writes an isolated CI-shaped env file instead of reusing local mobile env wholesale', () => {
    const { tempDir, rootEnvPath, mobileEnvPath, mobileEnv } = createParityEnvFiles({
      releaseEnv: 'development',
      sourceEnv: {
        EXPO_PUBLIC_SUPABASE_URL_DEV: 'https://dev.example.test',
        EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV: 'dev-anon',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
        ['UNRELATED_SECRET']: 'example-must-not-be-written',
      },
    });

    try {
      expect(fs.readFileSync(rootEnvPath, 'utf8')).toBe('');
      const written = fs.readFileSync(mobileEnvPath, 'utf8');
      expect(written).toContain('EXPO_PUBLIC_SUPABASE_PROFILE=core-development');
      expect(written).toContain('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN=true');
      expect(written).not.toContain('UNRELATED_SECRET');
      expect(mobileEnv.EXPO_PUBLIC_SITE_URL).toBe('https://hashpass.tech');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds a local Play-parity AAB with Gradle and the preview profile without Play upload', () => {
    const androidDir = path.join(os.tmpdir(), 'hashpass-play-parity-test-android');
    const gradlewPath = path.join(androidDir, 'gradlew');
    fs.mkdirSync(androidDir, { recursive: true });
    fs.writeFileSync(gradlewPath, '#!/usr/bin/env sh\n', 'utf8');

    const {
      buildFastlaneEnv,
      runExpoPrebuild,
      runFastlane,
    } = require('../../../../packages/tools/scripts/run-mobile-fastlane.js') as {
      buildFastlaneEnv: jest.Mock;
      runExpoPrebuild: jest.Mock;
      runFastlane: jest.Mock;
    };

    try {
      const result = buildLocalPlayParity({
        releaseEnv: 'development',
        track: 'internal',
        submit: false,
        baseEnv: {
          EAS_PROJECT_ID_DEV: developmentProjectIdFixture,
          EXPO_PUBLIC_SUPABASE_URL_DEV: 'https://dev.example.test',
          EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV: 'dev-anon',
          EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
          ANDROID_KEYSTORE_PATH: __filename,
          ['ANDROID_KEYSTORE_PASSWORD']: fakeStorePassword,
          ANDROID_KEY_ALIAS: 'upload',
          ['ANDROID_KEY_PASSWORD']: fakeKeyPassword,
        },
      });

      expect(result.profile).toBe('preview');
      expect(result.track).toBe('internal');
      expect(buildFastlaneEnv).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: 'preview',
          track: 'internal',
          rootEnvPath: expect.stringMatching(new RegExp(`${os.tmpdir()}.*\\.env-root$`)),
          mobileEnvPath: expect.stringMatching(new RegExp(`${os.tmpdir()}.*\\.env-mobile$`)),
        }),
      );
      expect(runExpoPrebuild).toHaveBeenCalledWith(
        expect.objectContaining({
          EAS_BUILD_PROFILE: 'preview',
          EXPO_NO_DOTENV: '1',
          FASTLANE_TRACK: 'internal',
        }),
      );
      expect(spawnSync).toHaveBeenCalledWith(
        gradlewPath,
        expect.arrayContaining([
          'bundleRelease',
          '--no-daemon',
          `-Pandroid.injected.signing.store.file=${__filename}`,
          `-Pandroid.injected.signing.store.password=${fakeStorePassword}`,
          '-Pandroid.injected.signing.key.alias=upload',
          `-Pandroid.injected.signing.key.password=${fakeKeyPassword}`,
        ]),
        expect.objectContaining({ cwd: androidDir }),
      );
      expect(runFastlane).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(androidDir, { recursive: true, force: true });
    }
  });

  it('keeps Fastlane reserved for explicit Play upload mode', () => {
    const { runFastlane } = require('../../../../packages/tools/scripts/run-mobile-fastlane.js') as {
      runFastlane: jest.Mock;
    };

    buildLocalPlayParity({
      releaseEnv: 'development',
      track: 'internal',
      submit: true,
      baseEnv: {
        EAS_PROJECT_ID_DEV: developmentProjectIdFixture,
        EXPO_PUBLIC_SUPABASE_URL_DEV: 'https://dev.example.test',
        EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV: 'dev-anon',
        EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'web-client-id',
        ANDROID_KEYSTORE_PATH: __filename,
        ['ANDROID_KEYSTORE_PASSWORD']: fakeStorePassword,
        ANDROID_KEY_ALIAS: 'upload',
        ['ANDROID_KEY_PASSWORD']: fakeKeyPassword,
      },
    });

    expect(runFastlane).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: 'preview',
        track: 'internal',
        submit: true,
      }),
    );
  });

  it('requires explicit opt-in before uploading anything to Play', () => {
    expect(parseParityArgs(['--submit'])).toMatchObject({ submit: true });
    expect(parseParityArgs(['--install'])).toMatchObject({ install: true, submit: false });
  });

  it('normalizes release-signing aliases for bundletool installation', () => {
    expect(
      resolveLocalSigningEnv({
        ANDROID_RELEASE_KEYSTORE_PATH: 'config/upload.jks',
        ['ANDROID_RELEASE_KEYSTORE_PASSWORD']: fakeStorePassword,
        ANDROID_RELEASE_KEY_ALIAS: 'upload',
        ['ANDROID_RELEASE_KEY_PASSWORD']: fakeKeyPassword,
      }),
    ).toMatchObject({
      ANDROID_KEYSTORE_PATH: path.resolve(__dirname, '../../../..', 'config/upload.jks'),
      ['ANDROID_KEYSTORE_PASSWORD']: fakeStorePassword,
      ANDROID_KEY_ALIAS: 'upload',
      ['ANDROID_KEY_PASSWORD']: fakeKeyPassword,
    });
  });

  it('redacts signing passwords from failed command messages', () => {
    expect(redactCommandArg(`--ks-pass=pass:${fakeStorePassword}`)).toBe('--ks-pass=pass:[redacted]');
    expect(redactCommandArg(`--key-pass=pass:${fakeKeyPassword}`)).toBe('--key-pass=pass:[redacted]');
    expect(redactCommandArg(`-Pandroid.injected.signing.store.password=${fakeStorePassword}`)).toBe(
      '-Pandroid.injected.signing.store.password=[redacted]',
    );
    expect(redactCommandArg(`-Pandroid.injected.signing.key.password=${fakeKeyPassword}`)).toBe(
      '-Pandroid.injected.signing.key.password=[redacted]',
    );
  });

  it('passes Android upload signing properties to Gradle', () => {
    expect(
      resolveGradleSigningArgs({
        ANDROID_KEYSTORE_PATH: __filename,
        ['ANDROID_KEYSTORE_PASSWORD']: fakeStorePassword,
        ANDROID_KEY_ALIAS: 'upload',
        ['ANDROID_KEY_PASSWORD']: fakeKeyPassword,
      }),
    ).toEqual([
      `-Pandroid.injected.signing.store.file=${__filename}`,
      `-Pandroid.injected.signing.store.password=${fakeStorePassword}`,
      '-Pandroid.injected.signing.key.alias=upload',
      `-Pandroid.injected.signing.key.password=${fakeKeyPassword}`,
    ]);
  });
});
