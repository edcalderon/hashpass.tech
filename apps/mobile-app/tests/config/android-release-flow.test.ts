/// <reference types="jest" />

import fs from 'fs';
import path from 'path';

const mobileAppRoot = path.resolve(__dirname, '../../');
const readJson = (relativePath: string) =>
  JSON.parse(fs.readFileSync(path.join(mobileAppRoot, relativePath), 'utf8')) as Record<string, any>;
const rootPackageJson = readJson('../../package.json') as Record<string, any>;
const appJson = readJson('app.json').expo as Record<string, any>;

const TEST_ENV_KEYS = [
  'EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_EAS_BUILD_PROFILE',
  'EAS_PROJECT_ID',
  'EXPO_PUBLIC_EAS_PROJECT_ID',
  'EAS_PROJECT_ID_DEV',
  'EXPO_PUBLIC_EAS_PROJECT_ID_DEV',
  'EXPO_OWNER',
  'EXPO_OWNER_DEV',
] as const;

function setEnv(entries: Partial<Record<(typeof TEST_ENV_KEYS)[number], string | undefined>>) {
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function loadExpoConfig(profile: 'production' | 'preview') {
  const previousEnv = Object.fromEntries(TEST_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof TEST_ENV_KEYS)[number],
    string | undefined
  >;

  jest.resetModules();

  try {
    const { buildEnv } = require('../../../../packages/tools/scripts/run-mobile-eas.js') as {
      buildEnv: (options?: { profile?: string; easArgs?: string[]; baseEnv?: Record<string, string> }) => Record<
        string,
        any
      >;
    };
    const { buildExpoConfig } = require('../../lib/eas-config.js') as {
      buildExpoConfig: (options?: { baseConfig?: Record<string, any>; env?: NodeJS.ProcessEnv }) => Record<
        string,
        any
      >;
    };

    const env = buildEnv({
      profile,
      easArgs: ['build', '--platform', 'android', '--profile', profile],
      baseEnv: {},
    });

    return {
      env,
      appConfig: buildExpoConfig({ baseConfig: appJson, env }),
    };
  } finally {
    setEnv(previousEnv);
    jest.resetModules();
  }
}

describe('Android release flow', () => {
  it('configures EAS production builds for Android App Bundles with remote version management', () => {
    const easConfig = readJson('eas.json');

    expect(easConfig.cli?.appVersionSource).toBe('remote');
    expect(easConfig.build?.production?.environment).toBe('production');
    expect(easConfig.build?.production?.autoIncrement).toBe(true);
    expect(easConfig.build?.production?.android?.buildType).toBe('app-bundle');
  });

  it('configures preview builds for internal development app bundle distribution', () => {
    const easConfig = readJson('eas.json');

    expect(easConfig.build?.development?.environment).toBe('development');
    expect(easConfig.build?.preview?.environment).toBe('preview');
    expect(easConfig.build?.preview?.android?.buildType).toBe('app-bundle');
    expect(easConfig.build?.preview?.autoIncrement).toBe(true);
    expect(easConfig.build?.preview?.env?.EAS_BUILD_PROFILE).toBe('preview');
    expect(easConfig.build?.preview?.env?.EAS_PROJECT_ID).toBe(
      'b07c6fde-24ef-434a-8329-761815afe901',
    );
    expect(easConfig.build?.production?.env?.EAS_BUILD_PROFILE).toBe('production');
    expect(easConfig.build?.production?.env?.EAS_PROJECT_ID).toBe(
      'f710aa31-82ef-4ee3-82a3-068b0fad04dc',
    );
    expect(easConfig.submit?.preview?.android?.track).toBe('internal');
    expect(easConfig.submit?.preview?.android?.serviceAccountKeyPath).toBe(
      '../../config/hashpass-eas.json',
    );
    expect(easConfig.submit?.production?.android?.serviceAccountKeyPath).toBe(
      '../../config/hashpass-eas.json',
    );
  });

  it('keeps app.json aligned with the current store version and leaves Expo project linking to app.config.js', () => {
    expect(appJson.version).toBe(rootPackageJson.version);
    expect(appJson.slug).toBe('hash-pass-tech');
    expect(appJson.android?.versionCode).toBeUndefined();
    expect(appJson.buildNumber).toBeUndefined();
    expect(appJson.extra?.eas?.projectId).toBeUndefined();
    expect(appJson.owner).toBe('hashpasstechs-team');
  });

  it('switches the Expo owner and project id for preview builds', () => {
    const { env, appConfig } = loadExpoConfig('preview');

    expect(env.EXPO_OWNER).toBeUndefined();
    expect(env.EXPO_OWNER_DEV).toBe('hashpasstechs-team');
    expect(appConfig.slug).toBe('hash-pass-tech');
    expect(appConfig.owner).toBe('hashpasstechs-team');
    expect(appConfig.extra?.eas?.projectId).toBe('b07c6fde-24ef-434a-8329-761815afe901');
  });

  it('keeps the production Expo owner and project id for release builds', () => {
    const { env, appConfig } = loadExpoConfig('production');

    expect(env.EXPO_OWNER).toBe('hashpasss-team');
    expect(env.EXPO_OWNER_DEV).toBeUndefined();
    expect(appConfig.slug).toBe('hashpasstech');
    expect(appConfig.owner).toBe('hashpasss-team');
    expect(appConfig.extra?.eas?.projectId).toBe('f710aa31-82ef-4ee3-82a3-068b0fad04dc');
  });

  it('publishes the preview Expo aliases through the mobile EAS wrapper', () => {
    const { buildEnv } = require('../../../../packages/tools/scripts/run-mobile-eas.js') as {
      buildEnv: (options?: { profile?: string; easArgs?: string[]; baseEnv?: Record<string, string> }) => Record<
        string,
        any
      >;
    };
    const env = buildEnv({
      profile: 'preview',
      easArgs: ['build', '--platform', 'android', '--profile', 'preview'],
      baseEnv: {},
    });

    expect(env.EAS_BUILD_PROFILE).toBe('preview');
    expect(env.EXPO_PUBLIC_EAS_BUILD_PROFILE).toBe('preview');
    expect(env.EAS_PROJECT_ID).toBe('b07c6fde-24ef-434a-8329-761815afe901');
    expect(env.EXPO_PUBLIC_EAS_PROJECT_ID).toBe('b07c6fde-24ef-434a-8329-761815afe901');
    expect(env.EAS_PROJECT_ID_DEV).toBe('b07c6fde-24ef-434a-8329-761815afe901');
    expect(env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV).toBe('b07c6fde-24ef-434a-8329-761815afe901');
    expect(env.EXPO_OWNER).toBeUndefined();
    expect(env.EXPO_OWNER_DEV).toBe('hashpasstechs-team');
  });

  it('exposes release scripts for bundle creation and Play Store submission', () => {
    const rootPackageJson = readJson('../../package.json');
    const mobilePackageJson = readJson('package.json');
    const reactNativeConfig = require('../../react-native.config.js') as {
      dependencies?: Record<string, { platforms?: { android?: { packageImportPath?: string } } }>;
    };
    const scripts = rootPackageJson.scripts as Record<string, string>;
    const rootDependencies = rootPackageJson.dependencies as Record<string, string>;
    const mobileScripts = mobilePackageJson.scripts as Record<string, string>;
    const mobileDependencies = mobilePackageJson.dependencies as Record<string, string>;

    expect(scripts['android:bundle']).toBe('pnpm --filter hashpass-mobile-app android:bundle');
    expect(scripts['android:bundle:dev']).toBe('pnpm --filter hashpass-mobile-app android:bundle:dev');
    expect(scripts['android:publish']).toBe('pnpm --filter hashpass-mobile-app android:publish');
    expect(scripts['android:publish:dev']).toBe('pnpm --filter hashpass-mobile-app android:publish:dev');
    expect(scripts['android:release']).toBe('pnpm --filter hashpass-mobile-app android:release');
    expect(scripts['android:release:dev']).toBe('pnpm --filter hashpass-mobile-app android:release:dev');
    expect(mobileScripts['android:bundle']).toBe(
      'node ../../packages/tools/scripts/run-mobile-eas.js build --platform android --profile production',
    );
    expect(mobileScripts['android:bundle:dev']).toBe(
      'node ../../packages/tools/scripts/run-mobile-eas.js build --platform android --profile preview',
    );
    expect(mobileScripts['android:publish']).toBe(
      'node ../../packages/tools/scripts/run-mobile-eas.js submit --platform android --profile production --latest',
    );
    expect(mobileScripts['android:publish:dev']).toBe(
      'node ../../packages/tools/scripts/run-mobile-eas.js submit --platform android --profile preview --latest',
    );
    expect(mobileScripts['android:release']).toBe(
      'node ../../packages/tools/scripts/run-mobile-release.js --env production',
    );
    expect(mobileScripts['android:release:dev']).toBe(
      'node ../../packages/tools/scripts/run-mobile-release.js --env development',
    );
    expect(rootDependencies['@babel/core']).toBe('^7.25.2');
    expect(rootDependencies['@babel/plugin-transform-react-jsx']).toBe('^7.28.6');
    expect(rootDependencies['babel-preset-expo']).toBe('^13.2.5');
    expect(rootDependencies.dotenv).toBe('^17.2.3');
    expect(rootDependencies['react-native-worklets']).toBeUndefined();
    expect(mobileDependencies['@babel/core']).toBe('^7.25.2');
    expect(mobileDependencies['@babel/plugin-transform-react-jsx']).toBe('^7.28.6');
    expect(mobileDependencies['babel-preset-expo']).toBe('^13.2.5');
    expect(mobileDependencies['expo-camera']).toBe('~16.1.9');
    expect(mobileDependencies['expo-barcode-scanner']).toBeUndefined();
    expect(mobileDependencies['react-native-worklets']).toBe('^0.6.0');
    expect(mobileDependencies['metro-resolver']).toBe('0.82.5');
    expect(reactNativeConfig.dependencies?.['react-native-worklets']?.platforms?.android).toBeNull();
    expect(reactNativeConfig.dependencies?.['react-native-worklets']?.platforms?.ios).toBeNull();
    expect(reactNativeConfig.dependencies?.expo?.platforms?.android?.packageImportPath).toBe(
      'import expo.modules.ExpoModulesPackage;',
    );
    expect(scripts.prepare).toContain('process.exit(1);');
    expect(scripts.prepare).toContain('|| husky');
  });
});
