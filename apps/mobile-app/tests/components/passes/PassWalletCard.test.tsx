/// <reference types="jest" />

import React from 'react';
import { Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import PassNotchMask from '../../../components/passes/PassNotchMask';
import PassTiltCard, { PassDepthLayer } from '../../../components/passes/PassTiltCard';
import PassWalletCard from '../../../components/passes/PassWalletCard';
import { withSpring } from 'react-native-reanimated';
import type { WalletPass } from '../../../lib/pass-wallet';

// Untyped require, matching tests/app/home.test.tsx's convention: the real
// @types/react-test-renderer types require findByType/find to take an actual
// component reference, not the plain RN element-name strings ('Text',
// 'Modal', 'Pressable'...) this file queries by everywhere.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { act, create } = require('react-test-renderer');

const routerPush = jest.fn();
const share = jest.fn();
const mockShowSuccess = jest.fn();
const mockShowError = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-svg', () => ({
  __esModule: true,
  default: 'Svg',
  Path: 'Path',
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  interpolate: (value: number) => value,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: number) => ({ value }),
  withSpring: jest.fn((value: number) => value),
}));

jest.mock('@react-native-masked-view/masked-view', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { paper: '#fff' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af' },
      warning: '#f59e0b',
    },
  }),
}));

jest.mock('../../../i18n/i18n', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        passSummary: 'Pass Summary',
        quickOverview: 'Quick overview',
        accessIncluded: 'Access included',
        requestsLeft: 'Requests left',
        boostLeft: 'Boost left',
        // A real (non-fallback) translation, so the local t() helper's
        // success path -- returning the translated string as-is, rather
        // than falling back to the caller's message -- gets exercised too.
        'type.vip': 'VIP',
      })[key] ?? key,
  }),
}));

jest.mock('../../../contexts/ToastContext', () => ({
  useToastHelpers: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}));

jest.mock('../../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../../components/DynamicQRDisplay', () => 'DynamicQRDisplay');
jest.mock('../../../lib/pass-system', () => ({
  passSystemService: {
    getPassTypeDisplayName: (type: string) => type === 'vip' ? 'VIP' : type,
  },
}));

const pass: WalletPass = {
  id: 'pass-1',
  pass_id: 'pass-1',
  pass_type: 'vip',
  status: 'active',
  pass_number: 'VIP-1234567890',
  max_requests: 10,
  used_requests: 2,
  remaining_requests: 8,
  max_boost: 100,
  used_boost: 20,
  remaining_boost: 80,
  access_features: [],
  special_perks: [],
  eventId: 'chile2026',
  eventName: 'BSL Chile 2026',
  eventDateLabel: 'August 2026',
  eventLocation: 'Santiago, Chile',
  accentColor: '#FF9500',
  timeline: 'upcoming',
  startsAt: null,
  endsAt: null,
  isArchived: false,
  searchText: 'bsl chile 2026',
};

const pressText = (renderer: ReturnType<typeof create>, label: string, occurrence = 0) => {
  let target: any = renderer.root.findAll(
    (node: any) => node.type === 'Text' && node.props.children === label,
  )[occurrence];

  while (target && typeof target.props?.onPress !== 'function') {
    target = target.parent;
  }

  expect(target).toBeDefined();
  target.props.onPress();
};

const render = (element: React.ReactElement) => {
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

describe('PassWalletCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: routerPush });
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);
    share.mockResolvedValue(undefined);
    if (!global.navigator) {
      Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
    }
    Object.assign(global.navigator, { share: undefined });
  });

  it('opens the QR modal, flips to the details side, and routes to full details', () => {
    const renderer = render(<PassWalletCard pass={pass} />);

    act(() => {
      pressText(renderer, 'QR Code');
    });
    expect(renderer.root.findByType('Modal').props.visible).toBe(true);
    expect(renderer.root.findByType('DynamicQRDisplay').props.passId).toBe('pass-1');

    act(() => {
      pressText(renderer, 'Details');
    });
    expect(renderer.root.findByProps({ children: 'Pass Summary' })).toBeTruthy();

    act(() => {
      pressText(renderer, 'View Full Details');
    });
    expect(routerPush).toHaveBeenCalledWith({
      pathname: '/dashboard/pass-details',
      params: { passId: 'pass-1', eventId: 'chile2026' },
    });
  });

  it('falls back to copying share text when browser sharing is unavailable', async () => {
    const renderer = render(<PassWalletCard pass={pass} />);

    await act(async () => {
      pressText(renderer, 'Share');
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('BSL Chile 2026'));
    expect(mockShowSuccess).toHaveBeenCalledWith('Pass Information Copied', expect.any(String));
  });

  it('copies the complete pass number from the ticket face', async () => {
    const renderer = render(<PassWalletCard pass={pass} />);
    const copyAction = renderer.root.findByProps({ accessibilityLabel: 'Copy pass number' });

    await act(async () => {
      copyAction.props.onPress();
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('VIP-1234567890');
    expect(mockShowSuccess).toHaveBeenCalledWith('Pass number copied', expect.any(String));
  });

  it('disables every card action when the card is behind the active pass', () => {
    const renderer = render(<PassWalletCard pass={pass} interactive={false} />);
    const actionButtons = renderer.root
      .findAllByType('TouchableOpacity')
      .filter((button: any) => typeof button.props.disabled === 'boolean');

    expect(actionButtons.length).toBeGreaterThanOrEqual(3);
    expect(actionButtons.every((button: any) => button.props.disabled)).toBe(true);
  });

  it('disables QR generation for an archived pass even as the front card', () => {
    // Regression: generate_pass_qr rejects any non-active pass, so an
    // archived front card (cancelled/expired/used/suspended) must disable
    // the QR action itself rather than relying on `interactive`, which only
    // reflects stack position and is true for the front card regardless of
    // the underlying pass's status.
    const archivedPass: WalletPass = { ...pass, status: 'expired', isArchived: true };
    const renderer = render(<PassWalletCard pass={archivedPass} />);

    const qrButtons = renderer.root
      .findAll((node: any) => node.type === 'Text' && node.props.children === 'QR Code')
      .map((text: any) => text.parent);

    expect(qrButtons.length).toBeGreaterThan(0);
    expect(qrButtons.every((button: any) => button.props.disabled)).toBe(true);

    // Every OTHER action stays enabled -- only the QR path is unsafe here.
    act(() => {
      pressText(renderer, 'Details');
    });
    expect(renderer.root.findByProps({ children: 'Pass Summary' })).toBeTruthy();
  });

  it.each([
    ['business', 'B2B + Closing Party'],
    ['general', 'General Access'],
    ['unrecognized-type', 'Event Access'],
  ])('renders the right access copy for pass_type=%s', (passType, expectedAccessCopy) => {
    const renderer = render(<PassWalletCard pass={{ ...pass, pass_type: passType as any }} />);

    // Front and back faces both render getPassAccess's output (image overlay
    // and the "Access Included" section respectively), so this legitimately
    // appears twice in one render.
    expect(renderer.root.findAllByProps({ children: expectedAccessCopy }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: passType.toUpperCase() }).length).toBeGreaterThan(0);
  });

  it('uses the Web Share API directly when the browser supports it', async () => {
    const nativeShare = jest.fn().mockResolvedValue(undefined);
    Object.assign(global.navigator, { share: nativeShare });
    const renderer = render(<PassWalletCard pass={pass} />);

    await act(async () => {
      pressText(renderer, 'Share');
    });

    expect(nativeShare).toHaveBeenCalledWith({
      title: 'BSL Chile 2026 VIP Pass',
      text: expect.stringContaining('BSL Chile 2026'),
    });
    expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  });

  it('does not treat a cancelled share sheet as an error', async () => {
    (Clipboard.setStringAsync as jest.Mock).mockRejectedValueOnce(new Error('User cancelled the share sheet'));
    const renderer = render(<PassWalletCard pass={pass} />);

    await act(async () => {
      pressText(renderer, 'Share');
    });

    // The message contains "cancel" -> early return, no fallback attempt,
    // no error toast.
    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('shows an error toast when even the clipboard fallback fails', async () => {
    (Clipboard.setStringAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('clipboard unavailable'))
      .mockRejectedValueOnce(new Error('clipboard unavailable'));
    const renderer = render(<PassWalletCard pass={pass} />);

    await act(async () => {
      pressText(renderer, 'Share');
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(2);
    expect(mockShowError).toHaveBeenCalledWith('Error', 'Unable to share pass. Please try again.');
  });
});

describe('PassTiltCard', () => {
  it('forwards presses and does not disable a supplied press handler', () => {
    const onPress = jest.fn();
    const renderer = render(
      <PassTiltCard disabled onPress={onPress} accentColor="#007AFF">
        <Text>Pass content</Text>
      </PassTiltCard>,
    );

    const pressable = renderer.root.findByType('Pressable');
    expect(pressable.props.disabled).toBe(false);

    act(() => {
      pressable.props.onPress();
      pressable.props.onPressIn();
      pressable.props.onPressOut();
    });
    expect(onPress).toHaveBeenCalledTimes(1);
    // disabled short-circuits handlePressIn/Out before they touch the shared
    // value -- withSpring must never fire for a disabled card.
    expect(withSpring).not.toHaveBeenCalled();
  });

  it('animates the press-in/press-out shared value when the card is interactive', () => {
    const renderer = render(
      <PassTiltCard accentColor="#34A853">
        <Text>Pass content</Text>
      </PassTiltCard>,
    );
    const pressable = renderer.root.findByType('Pressable');

    act(() => {
      pressable.props.onPressIn();
    });
    expect(withSpring).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ damping: 18 }));

    act(() => {
      pressable.props.onPressOut();
    });
    expect(withSpring).toHaveBeenNthCalledWith(2, 0, expect.objectContaining({ damping: 18 }));
  });

  it('renders the native depth layer as a plain View passthrough', () => {
    const renderer = render(
      <PassDepthLayer depth={12} pointerEvents="none" style={{ opacity: 0.5 }}>
        <Text>Layer content</Text>
      </PassDepthLayer>,
    );

    const view = renderer.root.findByType('View');
    expect(view.props.style).toEqual({ opacity: 0.5 });
    expect(view.props.pointerEvents).toBe('none');
    expect(renderer.root.findByProps({ children: 'Layer content' })).toBeTruthy();
  });
});

describe('PassNotchMask', () => {
  it('renders the rounded ticket silhouette with two even-odd notch holes', () => {
    const renderer = render(
      <PassNotchMask width={340} height={390} cornerRadius={16} notchRadius={11} notchYRatio={0.58} />,
    );
    const path = renderer.root.findByType('Path');

    expect(path.props.fillRule).toBe('evenodd');
    expect(path.props.d).toContain('M -11,226.2');
    expect(path.props.d).toContain('M 329,226.2');
  });
});
