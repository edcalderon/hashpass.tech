import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
let mockDark = false;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: mockDark, colors: {
  primary: '#a00', primaryContrastText: '#fff', divider: '#ddd',
  background: { paper: '#fafafa', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('@contexts/ScrollContext', () => ({ useScroll: () => ({ headerHeight: 90 }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 20 }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../components/BlockchainTokensView', () => 'Rewards');
jest.mock('../../components/HashPointsView', () => 'Points');
jest.mock('../../components/PassesDisplay', () => 'PassesDisplay');
jest.mock('../../components/wallet/WalletEnrollmentView', () => 'WalletEnrollment');
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, isLoading: false }) }));
let mockPhase = 'unlocked';
const mockPinDone = jest.fn();
jest.mock('../../hooks/useWalletGuard', () => ({
  WALLET_UNLOCK_SCOPE: 'wallet:unlock',
  useWalletGuard: () => ({ phase: mockPhase, pin: {}, onPinDone: mockPinDone, retry: jest.fn(), lock: jest.fn() }),
}));
jest.mock('../../components/security/PinFlow', () => 'PinFlow');
import Wallet from '../../app/(shared)/dashboard/wallet';

it('explains setup availability, expands security, and navigates to genuine pass/reward surfaces', () => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<Wallet />); });
  expect(view.root.findAllByType('WalletEnrollment' as any)).toHaveLength(1);
  expect(JSON.stringify(view.toJSON())).not.toContain('BSL2025-VIP-001');
  // The security accordion is the only button whose state carries `expanded`; the balance
  // card's Send/Receive action buttons come first in the tree.
  const securityButton = () => view.root.findAllByType(Pressable)
    .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityState && 'expanded' in node.props.accessibilityState)!;
  act(() => securityButton().props.onPress());
  expect(securityButton().props.accessibilityState.expanded).toBe(true);
  expect(JSON.stringify(view.toJSON())).toContain('never enter its recovery phrase here');
  const tabs = () => view.root.findAllByType(Pressable).filter(node => node.props.accessibilityRole === 'tab');
  act(() => tabs()[1].props.onPress());
  expect(view.root.findAllByType('Rewards' as any)).toHaveLength(1);
  expect(tabs()[1].props.accessibilityState.selected).toBe(true);
  act(() => tabs()[2].props.onPress());
  expect(view.root.findByType('PassesDisplay' as any).props.mode).toBe('dashboard');
  expect(view.root.findAllByType('Rewards' as any)).toHaveLength(0);
  act(() => view.unmount());
});

it('renders the shared segmented tabs in dark mode', () => {
  mockDark = true;
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const tabs = view.root.findAllByType(Pressable).filter(node => node.props.accessibilityRole === 'tab');
    expect(tabs.length).toBeGreaterThan(1);
    expect(view.root.findAll(node => node.props.accessibilityRole === 'tablist')).not.toHaveLength(0);
  } finally {
    mockDark = false;
    act(() => view.unmount());
  }
});

it.each([['pin_setup', 'create'], ['pin_entry', 'unlock'], ['locked', 'unlock']])(
  'shows the PIN gate instead of wallet content while %s', (phase, intent) => {
    mockPhase = phase;
    let view!: ReactTestRenderer;
    try {
      act(() => { view = create(<Wallet />); });
      const flow = view.root.findByType('PinFlow' as any);
      expect(flow.props.intent).toBe(intent);
      expect(flow.props.scope).toBe('wallet:unlock');
      expect(view.root.findAllByType('WalletEnrollment' as any)).toHaveLength(0);
      expect(view.root.findAllByType('Rewards' as any)).toHaveLength(0);
    } finally { mockPhase = 'unlocked'; act(() => view.unmount()); }
  });

it('hides content while the guard is still checking or unavailable', () => {
  for (const phase of ['checking', 'unavailable']) {
    mockPhase = phase;
    let view!: ReactTestRenderer;
    act(() => { view = create(<Wallet />); });
    expect(view.root.findAllByType('WalletEnrollment' as any)).toHaveLength(0);
    expect(view.root.findAllByType('PinFlow' as any)).toHaveLength(0);
    act(() => view.unmount());
  }
  mockPhase = 'unlocked';
});
