import React, { useContext } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { AppState } from 'react-native';
import { ContactMessagingContext } from '../../contexts/ContactMessagingContext';
import { ContactMessagingProvider } from '../../providers/ContactMessagingProvider';
import type { MessagingContextValue, MessagingSnapshot } from '../../types/contact-messaging';

const mockUseAuth = jest.fn();
const mockGet = jest.fn();
const mockRemoveAppStateListener = jest.fn();
let mockOnAppStateChange: ((state: string) => void) | null = null;

jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../../lib/api-client', () => ({ apiClient: { get: (...args: unknown[]) => mockGet(...args) } }));

const snapshot = (self: string): MessagingSnapshot => ({ self, conversations: [] });
const reply = (data: MessagingSnapshot) => ({ success: true, data: { data } });
let value: MessagingContextValue | null = null;
function Probe() {
  value = useContext(ContactMessagingContext);
  return null;
}
const tree = () => <ContactMessagingProvider><Probe /></ContactMessagingProvider>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    mockOnAppStateChange = listener as (state: string) => void;
    return { remove: mockRemoveAppStateListener };
  });
  jest.useRealTimers();
  mockOnAppStateChange = null;
  value = null;
  mockUseAuth.mockReturnValue({ user: { id: 'account-a' }, isLoading: false });
  mockGet.mockResolvedValue(reply(snapshot('account-a')));
});

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

it('loads the signed-in inbox and refreshes after a successful mutation', async () => {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(tree()); });

  expect(mockGet).toHaveBeenCalledWith('contact-messages', { skipEventSegment: true, retries: 0 });
  expect(value?.account).toBe('account-a');
  expect(value?.snapshot).toEqual(snapshot('account-a'));
  expect(value?.loading).toBe(false);

  await act(async () => { value?.changed(); });
  expect(mockGet).toHaveBeenCalledTimes(2);
  expect(value?.refreshVersion).toBe(1);
  act(() => view.unmount());
});

it('keeps requests account-scoped and drops a stale response after switching accounts', async () => {
  const pending: Array<(result: ReturnType<typeof reply>) => void> = [];
  mockGet.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
  let view!: ReactTestRenderer;
  await act(async () => { view = create(tree()); });
  expect(value?.loading).toBe(true);

  mockUseAuth.mockReturnValue({ user: { id: 'account-b' }, isLoading: false });
  await act(async () => { view.update(tree()); });
  expect(value?.account).toBe('account-b');
  expect(value?.snapshot).toBeNull();
  expect(mockGet).toHaveBeenCalledTimes(2);

  await act(async () => { pending[0](reply(snapshot('account-a'))); });
  expect(value?.account).toBe('account-b');
  expect(value?.snapshot).toBeNull();
  await act(async () => { pending[1](reply(snapshot('account-b'))); });
  expect(value?.snapshot).toEqual(snapshot('account-b'));
  act(() => view.unmount());
});

it('exposes inbox errors and clears them after a successful retry', async () => {
  mockGet.mockRejectedValueOnce(new Error('offline'));
  let view!: ReactTestRenderer;
  await act(async () => { view = create(tree()); });
  expect(value?.error).toBe('Messages are temporarily unavailable. Please try again.');
  expect(value?.loading).toBe(false);

  await act(async () => { await value?.reload(); });
  expect(value?.error).toBeNull();
  expect(value?.snapshot).toEqual(snapshot('account-a'));
  act(() => view.unmount());
});

it('polls only while active, refreshes on resume, and removes its listener', async () => {
  jest.useFakeTimers();
  let view!: ReactTestRenderer;
  await act(async () => { view = create(tree()); });
  expect(mockGet).toHaveBeenCalledTimes(1);

  await act(async () => { jest.advanceTimersByTime(15000); await Promise.resolve(); });
  expect(mockGet).toHaveBeenCalledTimes(2);
  await act(async () => { mockOnAppStateChange?.('active'); await Promise.resolve(); });
  expect(mockGet).toHaveBeenCalledTimes(3);

  act(() => view.unmount());
  expect(mockRemoveAppStateListener).toHaveBeenCalledTimes(1);
});

it('does not request or subscribe to an inbox before authentication is ready', async () => {
  mockUseAuth.mockReturnValue({ user: null, isLoading: true });
  let view!: ReactTestRenderer;
  await act(async () => { view = create(tree()); });

  expect(value?.account).toBeNull();
  expect(value?.snapshot).toBeNull();
  expect(mockGet).not.toHaveBeenCalled();
  expect(AppState.addEventListener).not.toHaveBeenCalled();
  act(() => view.unmount());
});
