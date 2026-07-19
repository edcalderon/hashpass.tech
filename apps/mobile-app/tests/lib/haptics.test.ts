/// <reference types="jest" />

const mockImpactAsync = jest.fn();

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {
    Light: 'Light',
    Medium: 'Medium',
  },
  impactAsync: (...args: unknown[]) => mockImpactAsync(...args),
}));

// eslint-disable-next-line import/first
import { hapticLight, hapticMedium } from '../../lib/haptics';

describe('haptics helpers', () => {
  beforeEach(() => {
    mockImpactAsync.mockReset();
  });

  it('hapticLight fires a Light impact', () => {
    mockImpactAsync.mockResolvedValueOnce(undefined);

    hapticLight();

    expect(mockImpactAsync).toHaveBeenCalledWith('Light');
  });

  it('hapticMedium fires a Medium impact', () => {
    mockImpactAsync.mockResolvedValueOnce(undefined);

    hapticMedium();

    expect(mockImpactAsync).toHaveBeenCalledWith('Medium');
  });

  it('swallows a rejected impactAsync instead of throwing an unhandled rejection', async () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('no vibration motor'));

    expect(() => hapticLight()).not.toThrow();

    // Let the rejected promise's .catch() microtask run before the test ends,
    // so Jest doesn't report an unhandled rejection for this test.
    await new Promise((resolve) => setImmediate(resolve));
  });
});
