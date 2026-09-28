import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import McpLoginScreen from '../../app/(shared)/mcp/login';

const mockGetSession = jest.fn();
const mockReplace = jest.fn();
const mockLocationReplace = jest.fn();

jest.mock('better-auth/client', () => ({
  createAuthClient: () => ({ getSession: (...args: unknown[]) => mockGetSession(...args) }),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: { getApiUrl: () => 'https://api.hashpass.tech/api/' },
}));
jest.mock('@hashpass/ui/primitives', () => ({ Badge: 'Badge', Surface: 'Surface' }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

const signedQuery =
  '?client_id=chatgpt&response_type=code&redirect_uri=https%3A%2F%2Fchatgpt.com%2Foauth%2Fcallback&scope=openid+plane%3Aread&state=state-123&exp=1790620000&sig=signed-value';

describe('MCP login screen', () => {
  let renderer: ReactTestRenderer | null = null;
  const originalWindow = global.window;
  const root = () => {
    if (!renderer) throw new Error('Screen was not rendered');
    return renderer.root;
  };

  const setWindowSearch = (search: string) => {
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search, replace: mockLocationReplace } },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setWindowSearch(signedQuery);
  });

  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = null;
    Object.defineProperty(global, 'window', { configurable: true, value: originalWindow });
  });

  it('resumes the signed authorization request for an authenticated user', async () => {
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    await act(async () => {
      renderer = create(<McpLoginScreen />);
      await Promise.resolve();
    });

    expect(mockLocationReplace).toHaveBeenCalledWith(
      `https://api.hashpass.tech/api/auth/oauth2/authorize${signedQuery}`,
    );
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends a signed-out user through Hashpass login with the request preserved', async () => {
    mockGetSession.mockResolvedValue({ data: null });

    await act(async () => {
      renderer = create(<McpLoginScreen />);
      await Promise.resolve();
    });

    expect(mockReplace).toHaveBeenCalledWith(
      `/auth?returnTo=${encodeURIComponent(`/mcp/login${signedQuery}`)}`,
    );
  });

  it('shows a safe error for malformed or unverifiable requests', async () => {
    setWindowSearch('?client_id=chatgpt');
    await act(async () => {
      renderer = create(<McpLoginScreen />);
      await Promise.resolve();
    });
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toContain(
      'missing, invalid, or has expired',
    );

    act(() => renderer?.unmount());
    renderer = null;
    setWindowSearch(signedQuery);
    mockGetSession.mockRejectedValue(new Error('offline'));
    await act(async () => {
      renderer = create(<McpLoginScreen />);
      await Promise.resolve();
    });
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toContain(
      'could not verify your Hashpass session',
    );
  });
});
