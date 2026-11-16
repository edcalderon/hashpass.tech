import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, ScrollView } from 'react-native';

jest.mock('../../components/security/AuthenticatorFlow', () => ({ __esModule: true, default: 'AuthenticatorFlow' }));
jest.mock('../../components/contacts/ContactsScreen', () => ({ __esModule: true, default: 'ContactsScreen' }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Ionicons', MaterialIcons: 'MaterialIcons' }));
const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: (path: string) => mockRouterPush(path) }) }));
const mockAuthenticatorStatus = jest.fn((_request?: unknown) => Promise.resolve({ enabled: false }));
jest.mock('../../lib/authenticator-client', () => ({ authenticatorStatus: () => mockAuthenticatorStatus() }));
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
let mockWalletEnrollmentProps: Record<string, unknown> | null = null;
jest.mock('../../components/wallet/WalletEnrollmentView', () => {
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => {
      mockWalletEnrollmentProps = props;
      return require('react').createElement('WalletEnrollment', props);
    },
  };
});
jest.mock('../../components/wallet/WalletVaultFlow', () => 'WalletVaultFlow');
const mockEnrollmentLoad = jest.fn();
// Lazy closure, not the fn itself: the mock factory runs during the hoisted imports, before
// the const above has executed (the same pattern enrollment-view.test uses).
jest.mock('../../lib/wallet/enrollment-client', () => ({
  walletEnrollmentClient: { load: (...args: unknown[]) => mockEnrollmentLoad(...args) },
}));
jest.mock('../../providers/AnimationProvider', () => ({
  useAnimations: () => ({ animationsEnabled: true, setAnimationsEnabled: jest.fn(), isReady: true }),
}));
// The guard keys on the registry id (dbUserId), never the auth provider's own id.
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' }, dbUserId: 'reg-1', isLoading: false }) }));
let mockPhase = 'unlocked';
const mockPinDone = jest.fn();
const mockGuardPin = {};
jest.mock('../../hooks/useWalletGuard', () => ({
  WALLET_UNLOCK_SCOPE: 'wallet:unlock',
  useWalletGuard: () => ({ phase: mockPhase, pin: mockGuardPin, onPinDone: mockPinDone, retry: jest.fn(), lock: jest.fn() }),
}));
jest.mock('../../components/security/PinFlow', () => 'PinFlow');
import Wallet from '../../app/(shared)/dashboard/wallet';

beforeEach(() => {
  mockPhase = 'unlocked';
  mockRouterPush.mockReset();
  mockPinDone.mockClear();
  mockEnrollmentLoad.mockClear();
  mockAuthenticatorStatus.mockResolvedValue({ enabled: false });
  mockEnrollmentLoad.mockResolvedValue({ state: 'registered', setupEnabled: true, scope: { ownerId: 'reg-1', walletId: 'w1' } });
});

it('explains setup availability, expands security, and navigates to genuine pass/reward surfaces', async () => {
  mockPhase = 'locked';
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<Wallet />); await Promise.resolve(); });
  const pinFlow = view.root.findByType('PinFlow' as any);
  expect(mockEnrollmentLoad).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(view.toJSON())).not.toContain('YOUR HASHPASS');
  expect(JSON.stringify(view.toJSON())).not.toContain('Your contacts, assets, rewards and event passes.');
  act(() => { pinFlow.props.onAuthenticatorComplete('pin'); pinFlow.props.onDone('1234'); });
  mockPhase = 'unlocked';
  await act(async () => { view.update(<Wallet />); });
  expect(view.root.findAllByType('WalletEnrollment' as any)).toHaveLength(1);
  expect(view.root.findAll(node => node.props.style?.maxWidth === 720 && node.props.style?.alignSelf === 'center'))
    .not.toHaveLength(0);
  expect(mockWalletEnrollmentProps?.initialState).toMatchObject({ status: 'ready' });
  expect(mockEnrollmentLoad).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(view.toJSON())).toContain('PIN-only access is active. Add an authenticator for stronger security and easier PIN recovery.');
  expect(JSON.stringify(view.toJSON())).not.toContain('BSL2025-VIP-001');
  // The security accordion is the only button whose state carries `expanded`; the balance
  // card's Send/Receive action buttons come first in the tree.
  const securityButton = () => view.root.findAllByType(Pressable)
    .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityState && 'expanded' in node.props.accessibilityState)!;
  act(() => securityButton().props.onPress());
  expect(securityButton().props.accessibilityState.expanded).toBe(true);
  expect(JSON.stringify(view.toJSON())).toContain('never enter its recovery phrase here');
  const tabs = () => view.root.findAllByType(Pressable).filter(node => node.props.accessibilityRole === 'tab');
  act(() => tabs()[2].props.onPress());
  expect(view.root.findAllByType('Rewards' as any)).toHaveLength(1);
  expect(tabs()[2].props.accessibilityState.selected).toBe(true);
  act(() => tabs()[3].props.onPress());
  expect(view.root.findByType('PassesDisplay' as any).props.mode).toBe('dashboard');
  expect(view.root.findAllByType('Rewards' as any)).toHaveLength(0);
  act(() => view.unmount());
});

it('shows a dismissible security reminder after PIN-only unlock and hides it after authenticator unlock', async () => {
  mockPhase = 'pin_entry';
  let view!: ReactTestRenderer;
  try {
    await act(async () => { view = create(<Wallet />); await Promise.resolve(); });
    const pinFlow = view.root.findByType('PinFlow' as any);
    act(() => { pinFlow.props.onAuthenticatorComplete('pin'); });
    mockPhase = 'unlocked';
    await act(async () => { view.update(<Wallet />); await Promise.resolve(); });
    expect(JSON.stringify(view.toJSON())).toContain('PIN-only access is active.');
    expect(JSON.stringify(view.toJSON())).not.toContain('A PIN protects wallet access; an authenticator adds another step when enabled.');
    view.root.findByProps({ testID: 'authenticator-reminder' });
    const setupLink = view.root.findByProps({ accessibilityLabel: 'Set up two-step verification' });
    act(() => setupLink.props.onPress());
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/profile-settings?shortcut=authenticator');
    const dismiss = view.root.findByProps({ accessibilityLabel: 'Dismiss authenticator reminder' });
    act(() => dismiss.props.onPress());
    expect(view.root.findAllByProps({ testID: 'authenticator-reminder' })).toHaveLength(0);

    mockPhase = 'pin_entry';
    act(() => { view.update(<Wallet />); });
    const authenticatorFlow = view.root.findByType('PinFlow' as any);
    mockAuthenticatorStatus.mockResolvedValue({ enabled: true });
    act(() => { authenticatorFlow.props.onAuthenticatorComplete('authenticator'); });
    mockPhase = 'unlocked';
    await act(async () => { view.update(<Wallet />); await Promise.resolve(); });
    expect(JSON.stringify(view.toJSON())).not.toContain('PIN-only access is active.');
  } finally {
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});

it('renders the shared segmented tabs in dark mode', () => {
  mockDark = true;
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const tabs = view.root.findAllByType(Pressable).filter(node => node.props.accessibilityRole === 'tab');
    expect(tabs.length).toBeGreaterThan(1);
    expect(view.root.findAll(node => node.props.accessibilityRole === 'tablist')).not.toHaveLength(0);
    expect(view.root.findAllByType(ScrollView).some(node => node.props.horizontal)).toBe(true);
  } finally {
    mockDark = false;
    act(() => view.unmount());
  }
});

it('keeps the guard PIN session when mounting the wallet enrollment flow', () => {
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    expect(mockWalletEnrollmentProps?.pin).toBe(mockGuardPin);
  } finally { act(() => view.unmount()); }
});

it.each([['pin_setup', 'create'], ['pin_entry', 'unlock'], ['locked', 'unlock']])(
  'shows the PIN gate instead of wallet content while %s', async (phase, intent) => {
    mockPhase = phase;
    let view!: ReactTestRenderer;
    try {
      await act(async () => { view = create(<Wallet />); await Promise.resolve(); });
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

it('keeps the PIN pad in place while the wallet guard confirms a submitted PIN', () => {
  mockPhase = 'locked';
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    act(() => { view.root.findByType('PinFlow' as any).props.onDone('1234'); });
    expect(mockPinDone).toHaveBeenCalled();

    mockPhase = 'checking';
    act(() => { view.update(<Wallet />); });

    const pinFlow = view.root.findByType('PinFlow' as any);
    expect(pinFlow.props.pending).toBe(true);
    expect(pinFlow.props.pendingTitle).toBe('Opening wallet…');
    expect(JSON.stringify(view.toJSON())).not.toContain('Checking wallet…');
  } finally {
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});

it('offers the email-code recovery from the locked gate, without unlocking the wallet', async () => {
  mockPhase = 'pin_entry';
  mockEnrollmentLoad.mockResolvedValue({ state: 'registered', setupEnabled: true, scope: { ownerId: 'reg-1', walletId: 'w1' } });
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const forgot = view.root.findAllByType(Pressable)
      .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'I forgot my PIN')!;
    await act(async () => { forgot.props.onPress(); });
    expect(mockEnrollmentLoad).not.toHaveBeenCalled();
    await act(async () => { view.root.findByType('AuthenticatorFlow' as any).props.onDone(); });
    // The recovery mounts in the locked gate: recover-only, never the wallet's home.
    const flow = view.root.findByType('WalletVaultFlow' as any);
    expect(flow.props.recoverOnly).toBe(true);
    expect(flow.props.enrollment.state).toBe('registered');
    expect(view.root.findAllByType('PinFlow' as any)).toHaveLength(0);
    await act(async () => { flow.props.onExit(); });
    expect(view.root.findByType('PinFlow' as any)).toBeDefined();
  } finally {
    mockEnrollmentLoad.mockReset();
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});

it('keeps email-code PIN recovery available when the account has no authenticator', async () => {
  mockPhase = 'pin_entry';
  mockEnrollmentLoad.mockResolvedValue({ state: 'registered', setupEnabled: true, scope: { ownerId: 'reg-1', walletId: 'w1' } });
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const forgot = view.root.findAllByType(Pressable)
      .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'I forgot my PIN')!;
    await act(async () => { forgot.props.onPress(); });
    const flow = view.root.findByType('AuthenticatorFlow' as any);
    expect(flow.props.onUnenrolled).toEqual(expect.any(Function));
    expect(mockEnrollmentLoad).not.toHaveBeenCalled();
    await act(async () => { flow.props.onUnenrolled(); await Promise.resolve(); });
    expect(mockEnrollmentLoad).toHaveBeenCalledTimes(1);
    expect(view.root.findByType('WalletVaultFlow' as any).props.recoverOnly).toBe(true);
    expect(view.root.findAllByType('PinFlow' as any)).toHaveLength(0);
  } finally {
    mockEnrollmentLoad.mockReset();
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});

it('says so when the locked gate has no wallet to recover', async () => {
  mockPhase = 'pin_entry';
  mockEnrollmentLoad.mockResolvedValue({ state: 'enrolled', setupEnabled: true, scope: { ownerId: 'reg-1', walletId: 'w1' } });
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const forgot = view.root.findAllByType(Pressable)
      .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'I forgot my PIN')!;
    await act(async () => { forgot.props.onPress(); });
    expect(mockEnrollmentLoad).not.toHaveBeenCalled();
    await act(async () => { view.root.findByType('AuthenticatorFlow' as any).props.onDone(); });
    expect(JSON.stringify(view.toJSON())).toContain('This account has no wallet yet, so there is nothing to recover.');
    expect(view.root.findAllByType('WalletVaultFlow' as any)).toHaveLength(0);
  } finally {
    mockEnrollmentLoad.mockReset();
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});

it.each([
  ['a transport failure', new Error('offline'), 'We could not reach the PIN recovery service.'],
  ['an account without enrollment', new Error('wallet_not_enrolled'), 'This account has no wallet yet'],
])('maps %s from the locked-gate recovery check to an honest dead-end-free answer', async (_name, failure) => {
  mockPhase = 'pin_entry';
  mockEnrollmentLoad.mockRejectedValue(failure);
  let view!: ReactTestRenderer;
  try {
    act(() => { view = create(<Wallet />); });
    const forgot = view.root.findAllByType(Pressable)
      .find(node => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === 'I forgot my PIN')!;
    await act(async () => { forgot.props.onPress(); });
    expect(mockEnrollmentLoad).not.toHaveBeenCalled();
    await act(async () => { view.root.findByType('AuthenticatorFlow' as any).props.onDone(); });
    expect(JSON.stringify(view.toJSON())).toContain('Back to PIN entry');
    expect(view.root.findAllByType('WalletVaultFlow' as any)).toHaveLength(0);
    // Back to PIN entry is never a dead end: it returns to the gate's PIN pad. (It is the
    // only button Pressable in this state: the gate's PIN pad itself is a mocked string.)
    const back = view.root.findAllByType(Pressable)
      .find(node => node.props.accessibilityRole === 'button')!;
    await act(async () => { back.props.onPress(); });
    expect(view.root.findByType('PinFlow' as any)).toBeDefined();
  } finally {
    mockEnrollmentLoad.mockReset();
    mockPhase = 'unlocked';
    act(() => view.unmount());
  }
});
