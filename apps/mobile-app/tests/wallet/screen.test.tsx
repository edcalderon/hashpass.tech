import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}) }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: {
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
import Wallet from '../../app/(shared)/dashboard/wallet';

it('explains setup availability, expands security, and navigates to genuine pass/reward surfaces', () => {
  let view!: ReactTestRenderer;
  act(() => { view = create(<Wallet />); });
  expect(view.root.findAllByType('WalletEnrollment' as any)).toHaveLength(1);
  expect(JSON.stringify(view.toJSON())).not.toContain('BSL2025-VIP-001');
  const securityButton = () => view.root.findAllByType(Pressable).find(node => node.props.accessibilityRole === 'button')!;
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
