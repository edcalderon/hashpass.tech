import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, TextInput } from 'react-native';
const mockLocal = { exists: jest.fn(), lock: jest.fn(), recoveryPhrase: jest.fn(), exportBackup: jest.fn(), restore: jest.fn() };
const mockProvision = jest.fn();
const mockSaveFile = jest.fn(); const mockPickFile = jest.fn(); const mockImport = jest.fn();
let mockLock: () => void;
jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ colors: { primary: '#08a', divider: '#333', background: { paper: '#111' }, text: { primary: '#fff', secondary: '#aaa' } } }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../lib/wallet/device-wallet', () => ({ createDeviceWallet: () => mockLocal, walletOperationId: () => 'operation', walletRandom: jest.fn() }));
jest.mock('../../lib/wallet/lifecycle', () => ({ bindWalletLifecycle: (target: { lock(): void }) => { mockLock = () => target.lock(); return mockLock; } }));
jest.mock('../../lib/wallet/enrollment-client', () => ({ walletEnrollmentClient: {} }));
jest.mock('../../lib/wallet/recovery-files', () => ({ saveRecoveryFile: (...args: any[]) => mockSaveFile(...args), pickRecoveryFile: () => mockPickFile(), protectRecoveryScreen: async () => () => {} }));
jest.mock('@hashpass/wallet', () => ({ WalletProvisioning: class { provision = mockProvision; lock = mockLocal.lock; }, createRecoveryChallenge: () => ({ positions: [0, 1, 2], verify: () => true, dispose: jest.fn() }), importRecoveryBackup: (...args: any[]) => mockImport(...args) }));
import WalletOnboarding from '../../components/wallet/WalletOnboarding';
const row: any = { scope: { ownerId: 'owner', walletId: 'wallet', environment: 'development' }, state: 'enrolled', setupEnabled: true, wallet: null };
let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const press = async (label: string) => { await act(async () => { view.root.findAllByType(Pressable).find(button => button.props.accessibilityLabel === label)!.props.onPress(); }); };
const input = (label: string, value: string) => act(() => view.root.findAllByType(TextInput).find(field => field.props.accessibilityLabel === label)!.props.onChangeText(value));
beforeEach(() => { jest.clearAllMocks(); mockLocal.exists.mockResolvedValue(false); });
afterEach(() => { if (view) act(() => view.unmount()); });
it('requires matching passwords before provisioning and clears them after success', async () => {
  mockProvision.mockResolvedValue({ ...row, state: 'registered', wallet: {} });
  await act(async () => { view = create(<WalletOnboarding enrollment={row} />); });
  input('Wallet password', 'separate-wallet-password'); input('Confirm wallet password', 'different');
  await press('Create testnet wallet'); expect(mockProvision).not.toHaveBeenCalled();
  input('Confirm wallet password', 'separate-wallet-password');
  await press('Create testnet wallet'); expect(mockProvision).toHaveBeenCalledWith('separate-wallet-password');
  expect(content()).not.toContain('separate-wallet-password'); expect(content()).toContain('Signing remains unavailable');
});
it('never offers replacement creation when the registered wallet is missing locally', async () => {
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet: {} }} />); });
  expect(content()).toContain('Restore from encrypted backup'); expect(content()).not.toContain('Create testnet wallet');
});
it('clears phrase and password on background and discards late reveals', async () => {
  mockLocal.exists.mockResolvedValue(true);
  let reveal!: (value: string) => void;
  mockLocal.recoveryPhrase.mockReturnValue(new Promise(resolve => { reveal = resolve; }));
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet: {} }} />); });
  input('Wallet password', 'separate-wallet-password');
  await press('Reveal recovery phrase');
  await act(async () => { mockLock(); reveal('private recovery words'); });
  expect(content()).not.toContain('private recovery words'); expect(content()).not.toContain('separate-wallet-password');
});
it('keeps setup hidden when the rollout is disabled or in production', async () => {
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, setupEnabled: false }} />); });
  expect(view.toJSON()).toBeNull();
  await act(async () => { view.update(<WalletOnboarding enrollment={{ ...row, scope: { ...row.scope, environment: 'production' } }} />); });
  expect(view.toJSON()).toBeNull(); expect(mockProvision).not.toHaveBeenCalled();
});

it('requires both recovery words and a matching imported file before reporting verification', async () => {
  mockLocal.exists.mockResolvedValue(true); mockLocal.recoveryPhrase.mockResolvedValue('public test fixture phrase');
  mockPickFile.mockResolvedValue('encrypted fixture'); mockImport.mockResolvedValue({});
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet: { network: 'testnet' } }} />); });
  input('Wallet password', 'separate-wallet-password'); await press('Reveal recovery phrase');
  expect(content()).toContain('public test fixture phrase'.split(' ').map((w, i) => `${i + 1}. ${w}`).join('   '));
  await press('Hide phrase and verify words'); await press('Verify recovery words');
  expect(content()).not.toContain('Recovery words and encrypted backup verified');
  await press('Choose encrypted backup file'); input('Backup password', 'separate-backup-password'); await press('Verify saved backup');
  expect(mockImport).toHaveBeenCalledWith('encrypted fixture', 'separate-backup-password', { network: 'testnet' });
  expect(content()).toContain('Recovery words and encrypted backup verified');
  act(() => mockLock()); expect(content()).not.toContain('Recovery words and encrypted backup verified');
});
it('exports only after password confirmation and never counts export as proof', async () => {
  mockLocal.exists.mockResolvedValue(true); mockLocal.exportBackup.mockResolvedValue('encrypted fixture');
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet: {} }} />); });
  input('Wallet password', 'separate-wallet-password'); input('Backup password', 'separate-backup-password');
  input('Confirm backup password', 'wrong'); await press('Download encrypted backup'); expect(mockSaveFile).not.toHaveBeenCalled();
  input('Confirm backup password', 'separate-backup-password'); await press('Download encrypted backup');
  expect(mockSaveFile).toHaveBeenCalledWith('encrypted fixture');
  expect(content()).not.toContain('Recovery words and encrypted backup verified');
  expect(content()).not.toContain('separate-backup-password');
});
it('restores against the enrolled public wallet and never provisions another seed', async () => {
  mockPickFile.mockResolvedValue('encrypted fixture'); mockLocal.restore.mockResolvedValue({});
  const wallet = { network: 'testnet' };
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet }} />); });
  await press('Choose encrypted backup file');
  input('Wallet password', 'separate-wallet-password'); input('Confirm wallet password', 'separate-wallet-password');
  input('Backup password', 'separate-backup-password'); await press('Restore wallet on this device');
  expect(mockLocal.restore).toHaveBeenCalledWith('encrypted fixture', 'separate-backup-password', 'separate-wallet-password', wallet);
  expect(mockProvision).not.toHaveBeenCalled(); expect(content()).toContain('Reveal recovery phrase');
});
it('requires a risk acknowledgement and fresh password for plaintext export', async () => {
  mockLocal.exists.mockResolvedValue(true); mockLocal.recoveryPhrase.mockResolvedValue('public test fixture phrase');
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'registered', wallet: {} }} />); });
  expect(content()).not.toContain('Download unencrypted recovery phrase');
  await press('I understand the unencrypted file risk'); input('Wallet password', 'separate-wallet-password');
  await press('Download unencrypted recovery phrase');
  expect(mockLocal.recoveryPhrase).toHaveBeenCalledWith('separate-wallet-password');
  expect(mockSaveFile).toHaveBeenCalledWith('public test fixture phrase', true);
  expect(content()).not.toContain('Download unencrypted recovery phrase');
});

it('allows a reservation retry when provisioning has no local vault yet', async () => {
  mockProvision.mockResolvedValue({ ...row, state: 'registered', wallet: {} });
  await act(async () => { view = create(<WalletOnboarding enrollment={{ ...row, state: 'provisioning' }} />); });
  const resume = view.root.findAllByType(Pressable).find(button => button.props.accessibilityLabel === 'Resume wallet setup')!;
  expect(resume.props.disabled).toBeFalsy();
  input('Wallet password', 'separate-wallet-password');
  input('Confirm wallet password', 'separate-wallet-password');
  await press('Resume wallet setup');
  expect(mockProvision).toHaveBeenCalledWith('separate-wallet-password');
});
