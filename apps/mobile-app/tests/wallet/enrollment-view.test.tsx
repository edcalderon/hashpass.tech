import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import * as Clipboard from 'expo-clipboard';
import { ActionButton } from '@hashpass/ui/primitives';
import type { UsePin } from '../../hooks/usePin';
let mockUserId: string | null = 'owner-a';
const mockLoad = jest.fn();
const mockShowToast = jest.fn();
let mockVaultProps: Record<string, unknown> | null = null;
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: null, user: mockUserId ? { id: mockUserId } : null }) }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: {
  primary: '#a00', divider: '#ddd', background: { paper: '#fff', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock('../../lib/wallet/enrollment-client', () => ({ walletEnrollmentClient: { load: () => mockLoad() } }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('../../components/wallet/WalletVaultFlow', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => { mockVaultProps = props; return null; },
}));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../lib/wallet/share', () => ({
  sharePublicReceiveDetails: jest.fn(async () => true),
  openReceiveSocial: jest.fn(async () => true),
}));
import * as walletShare from '../../lib/wallet/share';
import WalletEnrollmentView from '../../components/wallet/WalletEnrollmentView';
const row = { scope: { ownerId: 'canonical-registry-a', walletId: 'wallet-a', environment: 'development' }, state: 'enrolled', wallet: null, setupEnabled: false };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const action = (label: string) => view.root.findAllByType(ActionButton).find(node => node.props.label === label);
const mockSharePublicReceiveDetails = walletShare.sharePublicReceiveDetails as jest.Mock;
const mockOpenReceiveSocial = walletShare.openReceiveSocial as jest.Mock;
beforeEach(() => { mockUserId = 'owner-a'; mockLoad.mockReset(); mockVaultProps = null; mockShowToast.mockClear(); (Clipboard.setStringAsync as jest.Mock).mockClear(); mockSharePublicReceiveDetails.mockClear(); mockOpenReceiveSocial.mockClear(); });
afterEach(() => { if (view) act(() => view.unmount()); });
it('distinguishes enrollment from a generated wallet and never offers signing', async () => {
  mockLoad.mockResolvedValue(row);
  await act(async () => { view = create(<WalletEnrollmentView />); });
  expect(content()).toContain('Enrollment ready');
  expect(content()).toContain('No keys have been created');
  // Send exists as a visible action but stays disabled: no signing is offered anywhere.
  const send = action('Send')!;
  expect(send).toBeDefined();
  expect(send.props.disabled).toBe(true);
  const receive = action('Receive')!;
  for (const button of [send, receive]) {
    const buttonStyles = Array.isArray(button.props.style) ? button.props.style.flat() : [button.props.style];
    expect(buttonStyles).toEqual(expect.arrayContaining([expect.objectContaining({ width: '100%' })]));
  }
});
it('passes the guard PIN session through to the vault flow', async () => {
  const pin = {} as UsePin;
  mockLoad.mockResolvedValue(row);
  await act(async () => { view = create(<WalletEnrollmentView pin={pin} />); });
  expect(mockVaultProps?.pin).toBe(pin);
});
it('handles unavailable metadata with retry without claiming enrollment', async () => {
  mockLoad.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(row);
  await act(async () => { view = create(<WalletEnrollmentView />); });
  expect(content()).toContain('Wallet status unavailable');
  expect(content()).not.toContain('Enrollment ready');
  // The error state keeps a visible action (a failed check never hides the setup path):
  // the prominent "Try again" button, not the plain Refresh link that only shows when ready.
  await act(async () => { action('Try again')!.props.onPress(); });
  expect(content()).toContain('Enrollment ready');
});
it('ignores stale responses after account change without equating registry and provider IDs', async () => {
  let finish!: (value: unknown) => void;
  mockLoad.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockRejectedValueOnce(new Error('second account offline'));
  await act(async () => { view = create(<WalletEnrollmentView />); });
  mockUserId = 'owner-b';
  await act(async () => { view.update(<WalletEnrollmentView />); finish(row); });
  expect(content()).toContain('Wallet status unavailable');
  expect(content()).not.toContain('Enrollment ready');
  mockUserId = null;
  await act(async () => { view.update(<WalletEnrollmentView />); });
  expect(content()).toContain('Sign in');
  expect(mockLoad).toHaveBeenCalledTimes(2);
});
it('shows actual registered addresses with network and read-only limitations', async () => {
  mockLoad.mockResolvedValue({ ...row, state: 'registered', wallet: { network: 'testnet',
    ethereum: { address: 'public-eth-address' }, bitcoin: { address: 'public-btc-address' }, solana: { address: 'public-sol-address' } } });
  await act(async () => { view = create(<WalletEnrollmentView />); });
  // The addresses live behind the Receive action in the unified balance card.
  await act(async () => { action('Receive')!.props.onPress(); });
  expect(content()).toContain('public-eth-address');
  expect(content()).toContain('public-btc-address');
  expect(content()).toContain('public-sol-address');
  expect(content()).toContain('Testnet');
  expect(content()).toContain('Connected');
  expect(content()).not.toContain('Network environment');
  expect(content()).toContain('READ ONLY');
  expect(content()).not.toContain('No keys have been created');
});

it('shows a QR action and copies public receive addresses', async () => {
  mockLoad.mockResolvedValue({ ...row, state: 'registered', wallet: { network: 'testnet',
    ethereum: { address: 'public-eth-address' }, bitcoin: { address: 'public-btc-address' }, solana: { address: 'public-sol-address' } } });
  await act(async () => { view = create(<WalletEnrollmentView />); });
  await act(async () => { action('Receive')!.props.onPress(); });

  const qrAction = view.root.findByProps({ accessibilityLabel: 'Show Ethereum QR code' });
  await act(async () => { qrAction.props.onPress(); });
  expect(content()).toContain('Receive on Ethereum');
  expect(content()).toContain('QRCode');
  expect(content()).toContain('https://hpass.id/w/testnet/ethereum/public-eth-address');

  await act(async () => { view.root.findAllByProps({ accessibilityLabel: 'Copy address' })[0].props.onPress(); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('public-eth-address');
  expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success', title: 'Address copied', duration: 2400, inbox: false }));
  expect(content()).toContain('Address copied');
  // A second press keeps the action live even while the feedback label is visible.
  await act(async () => { action('Address copied')!.props.onPress(); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(2);
  expect(content()).toContain('Copy address');

  await act(async () => { action('Share QR & link')!.props.onPress(); });
  expect(mockSharePublicReceiveDetails).toHaveBeenCalledWith(expect.objectContaining({
    url: 'https://hpass.id/w/testnet/ethereum/public-eth-address',
    message: expect.stringContaining('public-eth-address'),
  }));
  await act(async () => { action('More sharing options')!.props.onPress(); });
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'Copy public link' }).props.onPress(); });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('https://hpass.id/w/testnet/ethereum/public-eth-address');
  await act(async () => { action('More sharing options')!.props.onPress(); });
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'WhatsApp' }).props.onPress(); });
  expect(mockOpenReceiveSocial).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/?text='));
  expect(mockOpenReceiveSocial).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('https://hpass.id/w/testnet/ethereum/public-eth-address')));
});

it('keeps the wallet overflow menu floating over the card', async () => {
  mockLoad.mockResolvedValue({ ...row, state: 'registered', setupEnabled: true, wallet: { network: 'testnet',
    ethereum: { address: 'public-eth-address' }, bitcoin: { address: 'public-btc-address' }, solana: { address: 'public-sol-address' } } });
  await act(async () => { view = create(<WalletEnrollmentView />); });
  const more = view.root.findByProps({ accessibilityLabel: 'More wallet actions' });
  await act(async () => { more.props.onPress(); });
  const menu = view.root.findByProps({ accessibilityRole: 'menu' });
  const flattened = Array.isArray(menu.props.style) ? menu.props.style.flat() : [menu.props.style];
  expect(flattened).toEqual(expect.arrayContaining([expect.objectContaining({ position: 'absolute' })]));
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'Network' }).props.onPress(); });
  expect(content()).toContain('Mainnet');
  expect(content()).toContain('Your wallet. Your control.');
});

it('switches from USD to Peso and opens the LATAM peso selector', async () => {
  mockLoad.mockResolvedValue({ ...row, state: 'registered', setupEnabled: true, wallet: { network: 'testnet',
    ethereum: { address: 'public-eth-address' }, bitcoin: { address: 'public-btc-address' }, solana: { address: 'public-sol-address' } } });
  await act(async () => { view = create(<WalletEnrollmentView />); });

  const mode = view.root.findByProps({ accessibilityLabel: 'Balance currency mode' });
  const pesoTab = mode.findAll((node: any) => node.props.accessibilityRole === 'tab')
    .find((node: any) => node.findAll((child: any) => child.type === 'Text')
      .some((text: any) => String(text.props.children).startsWith('PESO')))!;
  await act(async () => { pesoTab.props.onPress(); });
  expect(content()).toContain('PESO - $LKS');
  expect(content()).toContain('$LKS · LatAm index');

  expect(content()).toContain('Argentine peso');
  const pesoMenu = view.root.findByProps({ accessibilityRole: 'radiogroup' });
  const flattenedMenuStyle = Array.isArray(pesoMenu.props.style) ? pesoMenu.props.style.flat() : [pesoMenu.props.style];
  expect(flattenedMenuStyle).toEqual(expect.arrayContaining([expect.objectContaining({ position: 'absolute' })]));
  expect(flattenedMenuStyle).toEqual(expect.arrayContaining([expect.objectContaining({ zIndex: 1000 })]));
  expect(flattenedMenuStyle).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: '#ffffff' })]));
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'Argentine peso' }).props.onPress(); });
  expect(content()).toContain('PESO - $ARS');
  expect(view.root.findAllByProps({ accessibilityRole: 'radiogroup' })).toHaveLength(0);
});

it('routes vault actions through the overflow menu', async () => {
  mockLoad.mockResolvedValue({ ...row, state: 'registered', setupEnabled: true, wallet: { network: 'testnet',
    ethereum: { address: 'public-eth-address' }, bitcoin: { address: 'public-btc-address' }, solana: { address: 'public-sol-address' } } });
  await act(async () => { view = create(<WalletEnrollmentView />); });
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'More wallet actions' }).props.onPress(); });
  await act(async () => { view.root.findByProps({ accessibilityLabel: 'Export recovery phrase' }).props.onPress(); });
  expect(mockVaultProps?.command).toEqual(expect.objectContaining({ type: 'REVEAL', nonce: expect.any(Number) }));
  expect(view.root.findAllByProps({ accessibilityLabel: 'More wallet actions' })).toHaveLength(1);
});
