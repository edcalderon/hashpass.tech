import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable } from 'react-native';
import { ActionButton } from '@hashpass/ui/primitives';
let mockUserId: string | null = 'owner-a';
const mockLoad = jest.fn();
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: null, user: mockUserId ? { id: mockUserId } : null }) }));
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: {
  primary: '#a00', divider: '#ddd', background: { paper: '#fff', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../lib/wallet/enrollment-client', () => ({ walletEnrollmentClient: { load: () => mockLoad() } }));
jest.mock('../../components/wallet/WalletVaultFlow', () => () => null);
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
import WalletEnrollmentView from '../../components/wallet/WalletEnrollmentView';
const row = { scope: { ownerId: 'canonical-registry-a', walletId: 'wallet-a', environment: 'development' }, state: 'enrolled', wallet: null, setupEnabled: false };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const action = (label: string) => view.root.findAllByType(ActionButton).find(node => node.props.label === label);
beforeEach(() => { mockUserId = 'owner-a'; mockLoad.mockReset(); });
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
  expect(content()).toContain('Test networks');
  expect(content()).toContain('READ ONLY');
  expect(content()).not.toContain('No keys have been created');
});
