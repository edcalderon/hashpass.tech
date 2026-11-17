import React from 'react';
import { act, create } from 'react-test-renderer';
import GlobalMessages from '../../components/messages/GlobalMessages';
import FloatingMessages from '../../components/messages/FloatingMessages';
import type { MessagingContextValue } from '../../types/contact-messaging';

const mockPush = jest.fn();
const mockRouter = { push: mockPush };
const mockConversations = [{
  id: 'peer', name: 'Robin', role: 'Builder', company: 'Studio',
  handle: 'robin', preview: 'Hello', updated_at: null, needs_reply: true,
}];
let mockMessaging: MessagingContextValue | null = null;
let mockPath = '/dashboard/wallet';
let mockTheme = { isDark: false };

jest.mock('../../contexts/ContactMessagingContext', () => ({ useContactMessaging: () => mockMessaging }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => mockTheme }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('expo-router', () => ({ usePathname: () => mockPath, useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 12 }) }));
jest.mock('../../components/messages/FloatingMessages', () => ({ __esModule: true, default: jest.fn(() => null) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockPath = '/dashboard/wallet';
  mockTheme = { isDark: false };
  mockMessaging = {
    account: 'account-id', error: null, loading: false, refreshVersion: 0,
    reload: jest.fn(async () => {}), changed: jest.fn(),
    snapshot: { self: 'self-id', conversations: mockConversations },
  };
});

it.each([
  ['without an account', null, '/dashboard/wallet'],
  ['before the snapshot loads', { account: 'account-id', snapshot: null }, '/dashboard/wallet'],
  ['on the contacts page', undefined, '/dashboard/contacts'],
  ['on authentication pages', undefined, '/auth/oauth/callback'],
  ['on MCP pages', undefined, '/mcp/consent'],
  ['on security pages', undefined, '/security/pin'],
] as const)('hides the floating action %s', (_label, override, path) => {
  if (override !== undefined) mockMessaging = override as MessagingContextValue | null;
  mockPath = path;
  let view!: ReturnType<typeof create>;
  act(() => { view = create(<GlobalMessages />); });
  expect(view.toJSON()).toBeNull();
  expect(FloatingMessages).not.toHaveBeenCalled();
  act(() => view.unmount());
});

it('shows pending replies with the active theme and opens Wallet → Contacts → Messages', () => {
  mockTheme = { isDark: true };
  let view!: ReturnType<typeof create>;
  act(() => { view = create(<GlobalMessages />); });

  const props = jest.mocked(FloatingMessages).mock.calls.at(-1)?.[0];
  expect(props).toEqual(expect.objectContaining({
    mode: 'dark', label: 'Messages', conversations: mockConversations,
  }));
  act(() => props?.onPress());
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/(shared)/dashboard/wallet',
    params: { section: 'contacts', tab: 'messages' },
  });
  expect(view.toJSON()).not.toBeNull();
  act(() => view.unmount());
});
