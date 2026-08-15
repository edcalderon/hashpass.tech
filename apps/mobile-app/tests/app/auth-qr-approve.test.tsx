/// <reference types="jest" />

import React from 'react';
import AuthQrApproveScreen from '../../app/(shared)/dashboard/auth-qr-approve';

const mockRespondToLogin = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = { challengeId: 'chal_123' };

jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563eb',
      background: { default: '#f8fafc' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', faint: '#9ca3af' },
      error: { main: '#dc2626' },
      success: { main: '#16a34a' },
    },
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../lib/hashpass-sdk', () => ({
  hashpassSdk: () => ({ authQr: { respondToLogin: (...args: unknown[]) => mockRespondToLogin(...args) } }),
}));

jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const { act, create } = require('react-test-renderer');

const findByText = (root: any, text: string) => {
  const matches = root.findAll((node: any) => Array.isArray(node.children) && node.children.includes(text));
  return matches[0];
};

const renderScreen = async () => {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<AuthQrApproveScreen />);
  });
  return renderer!;
};

const triggerPress = (node: any) => {
  const handler = node.props.onPress;
  if (typeof handler !== 'function') throw new Error('Expected a pressable node');
  return act(async () => {
    handler();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('AuthQrApproveScreen', () => {
  let renderer: ReturnType<typeof create> | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { challengeId: 'chal_123' };
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
    }
    renderer = null;
  });

  it('shows an invalid-code message when no challengeId param is present', async () => {
    mockParams = {};
    renderer = await renderScreen();
    expect(findByText(renderer.root, 'Invalid QR code')).toBeTruthy();
  });

  it('approves the login and shows a success state', async () => {
    mockRespondToLogin.mockResolvedValue({ status: 'approved' });
    renderer = await renderScreen();

    const approveButton = findByText(renderer.root, 'Approve').parent;
    await triggerPress(approveButton);

    expect(mockRespondToLogin).toHaveBeenCalledWith('chal_123', 'approve');
    expect(findByText(renderer.root, 'Login approved')).toBeTruthy();
  });

  it('denies the login and shows a denied state', async () => {
    mockRespondToLogin.mockResolvedValue({ status: 'denied' });
    renderer = await renderScreen();

    const denyButton = findByText(renderer.root, 'Deny').parent;
    await triggerPress(denyButton);

    expect(mockRespondToLogin).toHaveBeenCalledWith('chal_123', 'deny');
    expect(findByText(renderer.root, 'Login denied')).toBeTruthy();
  });

  it('shows the error banner and stays actionable when respondToLogin rejects', async () => {
    mockRespondToLogin.mockRejectedValue(new Error('network down'));
    renderer = await renderScreen();

    const approveButton = findByText(renderer.root, 'Approve').parent;
    await triggerPress(approveButton);

    expect(findByText(renderer.root, 'Something went wrong. Please try again.')).toBeTruthy();
    expect(findByText(renderer.root, 'Approve')).toBeTruthy();
  });

  it('navigates back when Cancel is pressed', async () => {
    mockRespondToLogin.mockResolvedValue({ status: 'approved' });
    renderer = await renderScreen();

    const cancelButton = findByText(renderer.root, 'Cancel').parent;
    await triggerPress(cancelButton);

    expect(mockBack).toHaveBeenCalled();
  });
});
