const mockGetItem = jest.fn();
const mockSetItem = jest.fn();
const mockRemoveItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
  removeItem: (...args: unknown[]) => mockRemoveItem(...args),
}));

import {
  clearPendingSignupMarketingConsent,
  readPendingSignupMarketingConsent,
  stageSignupMarketingConsent,
} from '../../lib/marketing-consent-pending';
import { SIGNUP_MARKETING_CONSENT_VERSION } from '../../lib/marketing-consent-policy';

const storageKey = 'hashpass.signup-marketing-consent.pending';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetItem.mockResolvedValue(null);
  mockSetItem.mockResolvedValue(undefined);
  mockRemoveItem.mockResolvedValue(undefined);
});

afterEach(() => jest.restoreAllMocks());

it('clears pending consent when neither email purpose is selected', async () => {
  await stageSignupMarketingConsent({ hashpassUpdates: false, partnerPromotions: false });

  expect(mockRemoveItem).toHaveBeenCalledWith(storageKey);
  expect(mockSetItem).not.toHaveBeenCalled();
});

it('stages selected purposes with a normalized email and versioned request ID', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

  await stageSignupMarketingConsent(
    { hashpassUpdates: true, partnerPromotions: false },
    ' User@Example.com ',
  );

  expect(mockSetItem).toHaveBeenCalledWith(storageKey, expect.any(String));
  const stored = JSON.parse(mockSetItem.mock.calls[0][1]);
  expect(stored).toEqual(expect.objectContaining({
    hashpassUpdates: true,
    partnerPromotions: false,
    consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
    createdAt: 1_000_000,
    email: 'user@example.com',
    requestId: expect.stringMatching(/^1000000-/),
  }));
});

it('reads a valid pending record and normalizes its stored email', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  mockGetItem.mockResolvedValue(JSON.stringify({
    hashpassUpdates: false,
    partnerPromotions: true,
    consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
    createdAt: 999_000,
    email: ' User@Example.com ',
    requestId: 'request-123',
  }));

  await expect(readPendingSignupMarketingConsent()).resolves.toEqual({
    consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
    hashpassUpdates: false,
    partnerPromotions: true,
    email: 'user@example.com',
    requestId: 'request-123',
  });
  expect(mockRemoveItem).not.toHaveBeenCalled();
});

it.each([
  ['invalid JSON', '{'],
  ['wrong consent version', { consentVersion: 'old' }],
  ['no selected purpose', { hashpassUpdates: false, partnerPromotions: false }],
  ['invalid creation time', { createdAt: 'yesterday' }],
  ['expired record', { createdAt: 0 }],
  ['short request ID', { requestId: 'x' }],
  ['missing request ID', { requestId: 4 }],
])('removes %s instead of replaying it', async (_label, input) => {
  jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
  const record = typeof input === 'string' ? input : JSON.stringify({
    hashpassUpdates: true,
    partnerPromotions: false,
    consentVersion: SIGNUP_MARKETING_CONSENT_VERSION,
    createdAt: 999_000,
    requestId: 'request-123',
    ...input,
  });
  mockGetItem.mockResolvedValue(record);

  await expect(readPendingSignupMarketingConsent()).resolves.toBeNull();
  expect(mockRemoveItem).toHaveBeenCalledWith(storageKey);
});

it('clears pending signup consent after a successful sync', async () => {
  await clearPendingSignupMarketingConsent();

  expect(mockRemoveItem).toHaveBeenCalledWith(storageKey);
});
