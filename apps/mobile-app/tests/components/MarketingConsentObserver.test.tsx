import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

const mockUseAuth = jest.fn();
const mockPost = jest.fn();
const mockReadPending = jest.fn();
const mockClearPending = jest.fn();

jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../../lib/api-client', () => ({ apiClient: { post: (...args: unknown[]) => mockPost(...args) } }));
jest.mock('../../lib/marketing-consent-pending', () => ({
  readPendingSignupMarketingConsent: (...args: unknown[]) => mockReadPending(...args),
  clearPendingSignupMarketingConsent: (...args: unknown[]) => mockClearPending(...args),
}));

import MarketingConsentObserver from '../../components/MarketingConsentObserver';

const pending = {
  consentVersion: 'signup-marketing-v2',
  hashpassUpdates: true,
  partnerPromotions: false,
  email: 'user@example.com',
  requestId: 'request-123',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { id: 'user-1', email: 'User@Example.com' }, isLoggedIn: true });
  mockReadPending.mockResolvedValue(pending);
  mockPost.mockResolvedValue({ success: true });
  mockClearPending.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function mount() {
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<MarketingConsentObserver />);
    await Promise.resolve();
  });
  return view;
}

it('does nothing until a user is signed in', async () => {
  mockUseAuth.mockReturnValue({ user: null, isLoggedIn: false });
  const view = await mount();

  expect(view.toJSON()).toBeNull();
  expect(mockReadPending).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});

it('clears pending consent if it belongs to a different signed-in email', async () => {
  mockReadPending.mockResolvedValue({ ...pending, email: 'another@example.com' });
  const view = await mount();

  expect(mockPost).not.toHaveBeenCalled();
  expect(mockClearPending).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
});

it('posts consent for the matching account and clears it after confirmation', async () => {
  const view = await mount();

  expect(mockPost).toHaveBeenCalledWith('marketing/consent', {
    consentVersion: pending.consentVersion,
    hashpassUpdates: true,
    partnerPromotions: false,
    requestId: pending.requestId,
  }, { skipEventSegment: true, retries: 0 });
  expect(mockClearPending).toHaveBeenCalledTimes(1);
  await act(async () => view.unmount());
});

it('retries transient failures and keeps consent pending until the server confirms it', async () => {
  jest.useFakeTimers();
  mockPost.mockResolvedValue({ success: false });
  let view!: ReactTestRenderer;

  await act(async () => {
    view = create(<MarketingConsentObserver />);
    await Promise.resolve();
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1_800);
  });

  expect(mockPost).toHaveBeenCalledTimes(3);
  expect(mockClearPending).not.toHaveBeenCalled();
  await act(async () => view.unmount());
  jest.useRealTimers();
});

it('warns when pending consent cannot be read', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockReadPending.mockRejectedValue(new Error('storage unavailable'));
  const view = await mount();

  expect(warn).toHaveBeenCalledWith(
    '[marketing/consent] signup opt-in could not be recorded:',
    expect.any(Error),
  );
  expect(mockPost).not.toHaveBeenCalled();
  await act(async () => view.unmount());
});

it('does not post when the observer unmounts while local consent is loading', async () => {
  let resolvePending!: (value: typeof pending) => void;
  mockReadPending.mockReturnValue(new Promise(resolve => { resolvePending = resolve; }));
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<MarketingConsentObserver />);
  });
  await act(async () => view.unmount());
  await act(async () => {
    resolvePending(pending);
    await Promise.resolve();
  });

  expect(mockPost).not.toHaveBeenCalled();
});
