/// <reference types="jest" />

jest.mock('@hashpass/backend', () => ({
  getCapInstance: jest.fn((namespace: string) => ({ namespace })),
}));

import cap from '../../lib/cap-instance';
import { getCapInstance } from '@hashpass/backend';

const mockGetCapInstance = getCapInstance as jest.Mock;

describe('cap-instance', () => {
  it('re-exports the shared Cap instance scoped to the mobile-app namespace', () => {
    expect(mockGetCapInstance).toHaveBeenCalledWith('mobile-app');
    expect(cap).toEqual({ namespace: 'mobile-app' });
  });
});
