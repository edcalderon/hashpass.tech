/// <reference types="jest" />

import React from 'react';
import { Alert, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import PassNotchMask from '../../../components/passes/PassNotchMask';
import PassTiltCard from '../../../components/passes/PassTiltCard';
import PassWalletCard from '../../../components/passes/PassWalletCard';
import type { WalletPass } from '../../../lib/pass-wallet';

// Untyped require, matching tests/app/home.test.tsx's convention: the real
// @types/react-test-renderer types require findByType/find to take an actual
// component reference, not the plain RN element-name strings ('Text',
// 'Modal', 'Pressable'...) this file queries by everywhere.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { act, create } = require('react-test-renderer');

const routerPush = jest.fn();
const share = jest.fn();

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
  withSpring: (value: number) => value,
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
      })[key] ?? key,
  }),
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
  const text = renderer.root.findAll((node: any) => node.type === 'Text' && node.props.children === label)[occurrence];
  text.parent?.props.onPress();
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
    expect(routerPush).toHaveBeenCalledWith('/dashboard/pass-details?passId=pass-1');
  });

  it('falls back to copying share text when browser sharing is unavailable', async () => {
    const renderer = render(<PassWalletCard pass={pass} />);

    await act(async () => {
      pressText(renderer, 'Share');
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('BSL Chile 2026'));
    expect(Alert.alert).toHaveBeenCalledWith('Pass Information Copied', expect.any(String), expect.any(Array));
  });

  it('disables every card action when the card is behind the active pass', () => {
    const renderer = render(<PassWalletCard pass={pass} interactive={false} />);
    const actionButtons = renderer.root
      .findAllByType('TouchableOpacity')
      .filter((button: any) => typeof button.props.disabled === 'boolean');

    expect(actionButtons.length).toBeGreaterThanOrEqual(3);
    expect(actionButtons.every((button: any) => button.props.disabled)).toBe(true);
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
