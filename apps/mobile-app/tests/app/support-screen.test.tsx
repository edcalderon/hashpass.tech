/// <reference types="jest" />

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Linking, Platform } from 'react-native';

const mockRouterBack = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockRouterBack }) }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(null),
}));
jest.mock('../../lib/vector-icons', () => ({
  MaterialIcons: 'MaterialIcons',
  NativeSafeIcon: 'NativeSafeIcon',
}));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('../../lib/api-client', () => ({ getCaptchaApiEndpoint: jest.fn() }));
jest.mock('../../components/SupportCaptcha', () => 'SupportCaptcha');
jest.mock('@hashpass/ui/primitives', () => ({
  Surface: 'Surface',
  ActionButton: 'ActionButton',
  FormField: 'FormField',
  Badge: 'Badge',
  HoverText: 'HoverText',
}));
jest.mock('../../lib/support/frappe-support-client', () => ({
  closeSupportTicket: jest.fn(),
  createSupportTicket: jest.fn(),
  getSupportAttachmentUrl: jest.fn(),
  getSupportTicket: jest.fn(),
  sendSupportAttachment: jest.fn(),
  sendSupportMessage: jest.fn(),
  SUPPORT_ATTACHMENT_ALLOWED_TYPES: [],
  SUPPORT_ATTACHMENT_MAX_BYTES: 10_000_000,
}));
jest.mock('../../lib/support/render-html-content', () => ({ SupportRichText: 'SupportRichText' }));
jest.mock('../../lib/support/pick-attachment', () => ({ isPickedAttachmentError: jest.fn(), pickAttachmentNative: jest.fn() }));

import SupportScreen from '../../app/(shared)/support';

describe('SupportScreen contact options', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  it('directs the alternate contact route to WhatsApp', async () => {
    Platform.OS = 'ios';
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    let screen!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      screen = TestRenderer.create(<SupportScreen />);
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ children: 'WhatsApp Support' })).toBeTruthy();
    expect(screen.root.findAllByProps({ children: 'Support Website' })).toHaveLength(0);

    act(() => {
      screen.root.findByProps({ accessibilityLabel: 'Chat with support on WhatsApp' }).props.onPress();
    });
    expect(openUrl).toHaveBeenCalledWith('https://wa.me/573194202614');
  });

  it('opens WhatsApp in a new window on web', async () => {
    Platform.OS = 'web';
    const openWindow = jest.fn();
    (globalThis as any).window = Object.assign((globalThis as any).window ?? {}, { open: openWindow });
    let screen!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      screen = TestRenderer.create(<SupportScreen />);
      await Promise.resolve();
    });
    act(() => {
      screen.root.findByProps({ accessibilityLabel: 'Chat with support on WhatsApp' }).props.onPress();
    });

    expect(openWindow).toHaveBeenCalledWith('https://wa.me/573194202614', '_blank', 'noopener,noreferrer');
  });

  it('swallows a failed native WhatsApp link without crashing', async () => {
    Platform.OS = 'android';
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
    let screen!: TestRenderer.ReactTestRenderer;

    await act(async () => {
      screen = TestRenderer.create(<SupportScreen />);
      await Promise.resolve();
    });
    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: 'Chat with support on WhatsApp' }).props.onPress();
      await Promise.resolve();
    });
  });
});
