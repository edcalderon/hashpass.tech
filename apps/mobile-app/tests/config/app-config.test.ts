/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const originalEnv = process.env.EAS_PROJECT_ID;
const originalBuildProfile = process.env.EAS_BUILD_PROFILE;
const originalDevProjectId = process.env.EAS_PROJECT_ID_DEV;
const originalOwner = process.env.EXPO_OWNER;
const originalDevOwner = process.env.EXPO_OWNER_DEV;
const originalReleaseBackend = process.env.MOBILE_RELEASE_BACKEND;
const originalAndroidVersionCode = process.env.MOBILE_ANDROID_VERSION_CODE;
const originalExpoUseLocalVersioning = process.env.EXPO_USE_LOCAL_VERSIONING;
const originalRouterOrigin = process.env.EXPO_PUBLIC_ROUTER_ORIGIN;
const originalRouterHeadOrigin = process.env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN;
const productionProjectIdFixture = 'fixture-eas-production-project-id';
const developmentProjectIdFixture = 'fixture-eas-development-project-id';

afterEach(() => {
  if (typeof originalEnv === 'undefined') {
    delete process.env.EAS_PROJECT_ID;
  } else {
    process.env.EAS_PROJECT_ID = originalEnv;
  }

  if (typeof originalBuildProfile === 'undefined') {
    delete process.env.EAS_BUILD_PROFILE;
  } else {
    process.env.EAS_BUILD_PROFILE = originalBuildProfile;
  }

  if (typeof originalDevProjectId === 'undefined') {
    delete process.env.EAS_PROJECT_ID_DEV;
  } else {
    process.env.EAS_PROJECT_ID_DEV = originalDevProjectId;
  }

  if (typeof originalOwner === 'undefined') {
    delete process.env.EXPO_OWNER;
  } else {
    process.env.EXPO_OWNER = originalOwner;
  }

  if (typeof originalDevOwner === 'undefined') {
    delete process.env.EXPO_OWNER_DEV;
  } else {
    process.env.EXPO_OWNER_DEV = originalDevOwner;
  }

  if (typeof originalReleaseBackend === 'undefined') {
    delete process.env.MOBILE_RELEASE_BACKEND;
  } else {
    process.env.MOBILE_RELEASE_BACKEND = originalReleaseBackend;
  }

  if (typeof originalAndroidVersionCode === 'undefined') {
    delete process.env.MOBILE_ANDROID_VERSION_CODE;
  } else {
    process.env.MOBILE_ANDROID_VERSION_CODE = originalAndroidVersionCode;
  }

  if (typeof originalExpoUseLocalVersioning === 'undefined') {
    delete process.env.EXPO_USE_LOCAL_VERSIONING;
  } else {
    process.env.EXPO_USE_LOCAL_VERSIONING = originalExpoUseLocalVersioning;
  }

  if (typeof originalRouterOrigin === 'undefined') {
    delete process.env.EXPO_PUBLIC_ROUTER_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_ROUTER_ORIGIN = originalRouterOrigin;
  }

  if (typeof originalRouterHeadOrigin === 'undefined') {
    delete process.env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN;
  } else {
    process.env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN = originalRouterHeadOrigin;
  }

  jest.resetModules();
});

describe('app.config', () => {
  it('injects the EAS project id from env into expo extra config', () => {
    process.env.EAS_PROJECT_ID = productionProjectIdFixture;
    process.env.EXPO_OWNER = 'hashpasss-team';
    process.env.EXPO_OWNER_DEV = 'hashpasstechs-team';
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.extra.eas.projectId).toBe(productionProjectIdFixture);
    expect(resolvedConfig.slug).toBe('hashpasstech');
    expect(resolvedConfig.owner).toBe('hashpasss-team');
  });

  it('prefers the development EAS project id for non-production build profiles', () => {
    process.env.EAS_BUILD_PROFILE = 'preview';
    process.env.EAS_PROJECT_ID = productionProjectIdFixture;
    process.env.EAS_PROJECT_ID_DEV = developmentProjectIdFixture;
    process.env.EXPO_OWNER = 'hashpasss-team';
    process.env.EXPO_OWNER_DEV = 'hashpasstechs-team';
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV;

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.extra.eas.projectId).toBe(developmentProjectIdFixture);
    expect(resolvedConfig.slug).toBe('hash-pass-tech');
    expect(resolvedConfig.owner).toBe('hashpasstechs-team');
  });

  it('injects a local Android version code for fastlane builds', () => {
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.MOBILE_RELEASE_BACKEND = 'fastlane';
    process.env.MOBILE_ANDROID_VERSION_CODE = '123456';

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.android.versionCode).toBe(123456);
    expect(resolvedConfig.owner).toBe('hashpasss-team');
  });

  it('passes through a local router origin allowlist for Expo dev server CORS', () => {
    process.env.EXPO_PUBLIC_ROUTER_ORIGIN = 'https://hashpass.tech';
    process.env.EXPO_PUBLIC_ROUTER_HEAD_ORIGIN = 'https://hashpass.tech';

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.extra.router.origin).toBe('https://hashpass.tech');
    expect(resolvedConfig.extra.router.headOrigin).toBe('https://hashpass.tech');
  });
});
