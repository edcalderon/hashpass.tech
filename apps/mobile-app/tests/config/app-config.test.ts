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

  jest.resetModules();
});

describe('app.config', () => {
  it('injects the EAS project id from env into expo extra config', () => {
    process.env.EAS_PROJECT_ID = 'f710aa31-82ef-4ee3-82a3-068b0fad04dc';
    process.env.EXPO_OWNER = 'hashpasss-team';
    process.env.EXPO_OWNER_DEV = 'hashpasstechs-team';
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.extra.eas.projectId).toBe('f710aa31-82ef-4ee3-82a3-068b0fad04dc');
    expect(resolvedConfig.slug).toBe('hashpasstech');
    expect(resolvedConfig.owner).toBe('hashpasss-team');
  });

  it('prefers the development EAS project id for non-production build profiles', () => {
    process.env.EAS_BUILD_PROFILE = 'preview';
    process.env.EAS_PROJECT_ID = 'f710aa31-82ef-4ee3-82a3-068b0fad04dc';
    process.env.EAS_PROJECT_ID_DEV = 'b07c6fde-24ef-434a-8329-761815afe901';
    process.env.EXPO_OWNER = 'hashpasss-team';
    process.env.EXPO_OWNER_DEV = 'hashpasstechs-team';
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_EAS_PROJECT_ID_DEV;

    const appConfigFactory = require('../../app.config.js');
    const resolvedConfig = appConfigFactory({ config: {} });

    expect(resolvedConfig.extra.eas.projectId).toBe('b07c6fde-24ef-434a-8329-761815afe901');
    expect(resolvedConfig.slug).toBe('hash-pass-tech');
    expect(resolvedConfig.owner).toBe('hashpasstechs-team');
  });
});
