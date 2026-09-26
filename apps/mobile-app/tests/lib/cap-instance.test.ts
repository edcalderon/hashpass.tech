/// <reference types="jest" />

jest.mock('@hashpass/backend', () => ({
  getCapInstance: jest.fn((namespace: string) => ({ namespace })),
}));
jest.mock('../../lib/server/captcha-storage', () => ({
  createSupabaseCaptchaStorage: jest.fn(() => ({ shared: true })),
}));

import cap from '../../lib/cap-instance';
import { getCapInstance } from '@hashpass/backend';
import { createSupabaseCaptchaStorage } from '../../lib/server/captcha-storage';

const mockGetCapInstance = getCapInstance as jest.Mock;

describe('cap-instance', () => {
  it('re-exports the shared Cap instance scoped to the mobile-app namespace', () => {
    expect(createSupabaseCaptchaStorage).toHaveBeenCalledWith('mobile-app');
    expect(mockGetCapInstance).toHaveBeenCalledWith('mobile-app', { shared: true });
    expect(cap).toEqual({ namespace: 'mobile-app' });
  });
});
