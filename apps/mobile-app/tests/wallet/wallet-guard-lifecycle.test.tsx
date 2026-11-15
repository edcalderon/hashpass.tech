import React from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useWalletGuard } from '../../hooks/useWalletGuard';
import { authenticatorProof, beginAuthenticatorChallenge, rememberAuthenticator } from '../../lib/authenticator-session';
const mockSetup = jest.fn();
let mockBackground: (value: string) => void;
let mockFocus: () => (() => void) | undefined;
let mockBlur: (() => void) | undefined;
let mockUnlocked = false;
const mockLock = jest.fn(() => { mockUnlocked = false; });
const mockPin = { isUnlocked: () => mockUnlocked, lock: mockLock };
jest.mock('../../lib/setup-client', () => ({ fetchSetup: () => mockSetup() }));
jest.mock('../../hooks/usePin', () => ({ usePin: () => mockPin }));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  Object.defineProperty(actual, 'Text', { configurable: true, value: 'Text' });
  Object.defineProperty(actual, 'AppState', {
    configurable: true,
    value: {
      currentState: 'active',
      addEventListener: (_: string, handler: (value: string) => void) => {
        mockBackground = handler;
        return { remove: jest.fn() };
      },
    },
  });
  return actual;
});
jest.mock('expo-router', () => ({ useFocusEffect: (callback: () => (() => void) | undefined) => {
  require('react').useEffect(() => { mockFocus = callback; mockBlur = callback(); return mockBlur; }, [callback]);
} }));
let guard: ReturnType<typeof useWalletGuard>;
function Harness() { guard = useWalletGuard('alice'); return <Text>{guard.phase}</Text>; }
let view: ReactTestRenderer;
beforeEach(() => { jest.clearAllMocks(); mockUnlocked = false; mockSetup.mockResolvedValue({ pin: { enabled: true } }); });
afterEach(() => act(() => view?.unmount()));
async function mount() { await act(async () => { view = create(<Harness />); }); }
const remember = () => rememberAuthenticator('alice', 'access', { token: 'totp', expiresAt: new Date(Date.now() + 60000).toISOString() });
async function unlock() { mockUnlocked = true; await act(async () => guard.onPinDone()); }
it('leaves an unopened wallet alone when the app backgrounds', async () => {
  await mount();
  await act(async () => mockBackground('background'));
  expect(guard.phase).toBe('pin_entry'); expect(mockUnlocked).toBe(false);
  expect(mockLock).not.toHaveBeenCalled();
});
it('requires a new check on each visit even when a previous PIN proof exists', async () => {
  mockUnlocked = true; await mount(); expect(guard.phase).toBe('pin_entry');
  await unlock(); expect(guard.phase).toBe('unlocked'); remember();
  await act(async () => mockBlur?.());
  expect(authenticatorProof('alice', 'access')).toBeNull(); expect(mockLock).toHaveBeenCalledWith('wallet:unlock');
  await act(async () => { mockBlur = mockFocus(); });
  expect(guard.phase).toBe('pin_entry');
});
it('removes authenticator and PIN authorization when the app backgrounds', async () => {
  await mount(); await unlock(); remember();
  await act(async () => mockBackground('background'));
  expect(guard.phase).toBe('locked'); expect(mockUnlocked).toBe(false);
  expect(authenticatorProof('alice', 'access')).toBeNull();
});
it('preserves the wallet PIN proof while an authenticator app handoff is active', async () => {
  await mount(); await unlock(); remember();
  const endChallenge = beginAuthenticatorChallenge();
  try {
    await act(async () => mockBackground('background'));
    expect(guard.phase).toBe('unlocked'); expect(mockUnlocked).toBe(true);
    expect(authenticatorProof('alice', 'access')).toBe('totp');
    expect(mockLock).not.toHaveBeenCalled();
  } finally {
    endChallenge();
  }
});
