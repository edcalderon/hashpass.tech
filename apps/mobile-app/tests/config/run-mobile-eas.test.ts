/// <reference types="jest" />

import fs from 'fs';
import os from 'os';
import path from 'path';

const { buildEnv } = require('../../../../packages/tools/scripts/run-mobile-eas.js') as {
  buildEnv: (options: {
    rootEnvPath?: string;
    mobileEnvPath?: string;
    baseEnv?: Record<string, string>;
    easArgs?: string[];
    profile?: string;
  }) => Record<string, string>;
};

describe('run-mobile-eas', () => {
  it('loads EXPO_TOKEN from the root env and preserves process overrides', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-eas-'));
    const rootEnvPath = path.join(tempDir, '.env');
    const mobileEnvPath = path.join(tempDir, 'mobile.env');

    fs.writeFileSync(
      rootEnvPath,
      ['EAS_PROJECT_ID=root-project', 'EXPO_TOKEN=root-token', 'ROOT_ONLY=from-root', 'SHARED=from-root'].join('\n'),
      'utf8',
    );
    fs.writeFileSync(
      mobileEnvPath,
      [
        'EAS_PROJECT_ID=mobile-project',
        'EAS_PROJECT_ID_DEV=mobile-dev-project',
        'EXPO_TOKEN=mobile-token',
        'MOBILE_ONLY=from-mobile',
        'SHARED=from-mobile',
      ].join('\n'),
      'utf8',
    );

    const env = buildEnv({
      rootEnvPath,
      mobileEnvPath,
      baseEnv: {
        SHARED: 'from-process',
        PROCESS_ONLY: 'from-process',
      },
    });

    expect(env.EAS_PROJECT_ID).toBe('root-project');
    expect(env.EXPO_TOKEN).toBe('root-token');
    expect(env.ROOT_ONLY).toBe('from-root');
    expect(env.MOBILE_ONLY).toBe('from-mobile');
    expect(env.SHARED).toBe('from-process');
    expect(env.PROCESS_ONLY).toBe('from-process');
  });

  it('selects the development EAS project and token for non-production profiles', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hashpass-eas-dev-'));
    const rootEnvPath = path.join(tempDir, '.env');
    const mobileEnvPath = path.join(tempDir, 'mobile.env');

    fs.writeFileSync(
      rootEnvPath,
      [
        'EAS_PROJECT_ID=prod-project',
        'EXPO_TOKEN=prod-token',
        'EAS_PROJECT_ID_DEV=dev-project',
        'EXPO_TOKEN_DEV=dev-token',
      ].join('\n'),
      'utf8',
    );
    fs.writeFileSync(mobileEnvPath, '', 'utf8');

    const env = buildEnv({
      rootEnvPath,
      mobileEnvPath,
      easArgs: ['build', '--platform', 'android', '--profile', 'preview'],
    });

    expect(env.EAS_BUILD_PROFILE).toBe('preview');
    expect(env.EAS_PROJECT_ID).toBe('dev-project');
    expect(env.EXPO_PUBLIC_EAS_PROJECT_ID).toBe('dev-project');
    expect(env.EXPO_TOKEN).toBe('dev-token');
  });
});
