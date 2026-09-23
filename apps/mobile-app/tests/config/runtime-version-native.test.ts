/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('expo-application', () => ({
  __esModule: true,
  nativeApplicationVersion: '1.9.49',
}), { virtual: true });

import { getInstalledNativeAppVersion } from '../../config/runtime-version';

describe('getInstalledNativeAppVersion', () => {
  it('reads the immutable installed binary version instead of the OTA bundle version', () => {
    // An OTA can load bundle 1.9.50 into an installed 1.9.49 Play binary.
    // Store update eligibility must retain the binary's version name.
    expect(getInstalledNativeAppVersion('1.9.50')).toBe('1.9.49');
  });
});
