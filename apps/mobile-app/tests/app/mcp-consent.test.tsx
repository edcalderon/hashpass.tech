import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import McpConsentScreen from '../../app/(shared)/mcp/consent';

const mockGet = jest.fn();
const mockConsent = jest.fn();
const mockAssign = jest.fn();

function mockActionButton(props: Record<string, unknown>) {
  return React.createElement('ActionButton', props);
}

jest.mock('../../lib/api-client', () => ({
  apiClient: { get: (...args: unknown[]) => mockGet(...args) },
}));
jest.mock('better-auth/client', () => ({
  createAuthClient: () => ({ oauth2: { consent: (...args: unknown[]) => mockConsent(...args) } }),
}));
jest.mock('@better-auth/oauth-provider/client', () => ({ oauthProviderClient: () => ({}) }));
jest.mock('@hashpass/config', () => ({
  ENV_CONFIG: { getApiUrl: () => 'https://api.hashpass.tech/api' },
}));
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
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: '?client_id=chatgpt&sig=signed', assign: mockAssign } },
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
    });

    expect(mockGet).toHaveBeenCalledWith('/auth/mcp-consent-query?client_id=chatgpt&sig=signed', {
      skipEventSegment: true,
    });
    expect(renderer?.root.findAllByType('ActionButton' as never)[0].props.disabled).toBe(false);
    const renderedText = renderer?.root.findAllByType('Text' as never).flatMap((node) => node.props.children).join(' ');
    expect(renderedText).toContain('ChatGPT');
    expect(renderedText).toContain('chatgpt-client-id');
    expect(renderedText).toContain('https://chatgpt.com/oauth/callback');
    await act(async () => renderer?.root.findAllByType('ActionButton' as never)[0].props.onPress());
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
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toBe('Request expired');
  });

  it('rejects missing requests and reports consent errors', async () => {
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: '', assign: mockAssign } },
    });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
    });
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toContain('missing or has expired');

    act(() => renderer?.unmount());
    renderer = null;
    Object.defineProperty(global, 'window', {
      configurable: true,
      value: { location: { search: '?client_id=chatgpt&sig=signed', assign: mockAssign } },
    });
    mockGet.mockResolvedValue({
      success: true,
      data: { clientId: 'chatgpt', clientName: '', clientUri: '', redirectUri: 'https://chatgpt.com/callback', scopes: [] },
    });
    mockConsent.mockResolvedValue({ error: { message: 'Consent failed' } });
    await act(async () => {
      renderer = create(<McpConsentScreen />);
      await Promise.resolve();
    });
    await act(async () => renderer?.root.findAllByType('ActionButton' as never)[0].props.onPress());
    expect(root().findByProps({ accessibilityRole: 'alert' }).props.children).toBe('Consent failed');
  });
});
