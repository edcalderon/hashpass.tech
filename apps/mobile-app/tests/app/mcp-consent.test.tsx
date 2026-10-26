import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import McpConsentScreen from '../../app/(shared)/mcp/consent';

const mockGet = jest.fn();
const mockConsent = jest.fn();
const mockGetSession = jest.fn();
const mockAssign = jest.fn();
const mockReplace = jest.fn();
const signedQuery = new URLSearchParams([
  ['client_id', 'chatgpt'],
  ['response_type', 'code'],
  ['redirect_uri', 'https://chatgpt.com/oauth/callback'],
  ['exp', String(Math.floor(Date.now() / 1000) + 60)],
  ['sig', 'signed'],
  ['ba_param', 'client_id'],
  ['ba_param', 'response_type'],
  ['ba_param', 'redirect_uri'],
  ['ba_param', 'exp'],
]).toString();

function mockActionButton(props: Record<string, unknown>) {
  return React.createElement('ActionButton', props);
}

jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('better-auth/client', () => ({
  createAuthClient: () => ({
    getSession: (...args: unknown[]) => mockGetSession(...args),
    oauth2: { consent: (...args: unknown[]) => mockConsent(...args) },
  }),
}));
jest.mock('@better-auth/oauth-provider/client', () => ({ oauthProviderClient: () => ({}) }));
jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: { getApiUrl: () => 'https://api.hashpass.tech/api' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@hashpass/ui/primitives', () => ({
  Badge: 'Badge',
  Surface: 'Surface',
  ActionButton: mockActionButton,
}));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));

describe('MCP consent screen', () => {
  let renderer: ReactTestRenderer | null = null;
  const originalWindow = global.window;
  const root = () => {
    if (!renderer) throw new Error('Screen was not rendered');
    return renderer.root;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: `?${signedQuery}`, assign: mockAssign } },
    });
  });

  afterEach(() => {
    if (renderer) act(() => renderer?.unmount());
    renderer = null;
    Object.defineProperty(global, 'window', { configurable: true, value: originalWindow });
  });

  it('shows verified permissions and redirects after consent', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        clientId: 'chatgpt-client-id',
        clientName: 'ChatGPT',
        clientUri: 'https://chatgpt.com',
        redirectUri: 'https://chatgpt.com/oauth/callback',
        scopes: ['openid', 'email', 'plane:read', 'unknown'],
      },
    });
    mockConsent.mockResolvedValue({ data: { redirectURI: 'https://chatgpt.com/oauth/callback?code=one' } });

    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGet).toHaveBeenCalledWith(`/auth/mcp-consent-query?${signedQuery}`, {
      skipEventSegment: true,
    });
    expect(renderer?.root.findAllByType('ActionButton' as never)[0].props.disabled).toBe(false);
    const renderedText = renderer?.root.findAllByType('Text' as never).flatMap((node) => node.props.children).join(' ');
    expect(renderedText).toContain('ChatGPT');
    expect(renderedText).toContain('chatgpt-client-id');
    expect(renderedText).toContain('https://chatgpt.com/oauth/callback');
    await act(async () => renderer?.root.findAllByType('ActionButton' as never)[0].props.onPress());
    // oauthProviderClient derives the signed subset from location.search.
    // Passing the whole query here would allow unsiged router parameters to
    // invalidate the authorization request at the provider.
    expect(mockConsent).toHaveBeenCalledWith({ accept: true });
    expect(mockAssign).toHaveBeenCalledWith('https://chatgpt.com/oauth/callback?code=one');
  });

  it('supports denial and displays verification failures', async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: { clientId: 'chatgpt', clientName: '', clientUri: '', redirectUri: 'https://chatgpt.com/callback', scopes: ['plane:write'] },
    });
    mockConsent.mockResolvedValue({ data: { redirectUri: 'https://chatgpt.com/oauth/callback?error=denied' } });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => renderer?.root.findAllByType('ActionButton' as never)[1].props.onPress());
    expect(mockConsent).toHaveBeenCalledWith({ accept: false });

    act(() => renderer?.unmount());
    renderer = null;
    mockGet.mockResolvedValue({ success: false, error: 'Request expired' });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
    });
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toContain('has expired');
  });

  it('rejects missing requests and reports consent errors', async () => {
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: '', assign: mockAssign } },
    });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toContain('missing or invalid');
    expect(root().findAllByType('ActionButton' as never)).toHaveLength(0);

    act(() => renderer?.unmount());
    renderer = null;
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: `?${signedQuery}`, assign: mockAssign } },
    });
    mockGet.mockResolvedValue({
      success: true,
      data: { clientId: 'chatgpt', clientName: '', clientUri: '', redirectUri: 'https://chatgpt.com/callback', scopes: [] },
    });
    mockConsent.mockResolvedValue({ error: { message: 'Consent failed' } });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => renderer?.root.findAllByType('ActionButton' as never)[0].props.onPress());
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toBe('Consent failed');
  });

  it('redirects an anonymous visitor to sign-in before verifying MCP consent', async () => {
    mockGetSession.mockResolvedValue({ data: null });

    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetSession).toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith(
      `/auth?returnTo=${encodeURIComponent(`/mcp/login?${signedQuery}`)}`,
    );
    expect(mockGet).not.toHaveBeenCalled();
    expect(root().findAllByType('ActionButton' as never)).toHaveLength(0);
  });
});
