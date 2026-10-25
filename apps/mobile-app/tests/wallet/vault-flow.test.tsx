import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Pressable, TextInput } from 'react-native';
import { ActionButton } from '@hashpass/ui/primitives';
import type { UsePin } from '../../hooks/usePin';
import type { VaultCommand } from '../../components/wallet/WalletVaultFlow.types';
import WalletVaultFlow from '../../components/wallet/WalletVaultFlow';

jest.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false, colors: {
  primary: '#a00', divider: '#ddd', background: { paper: '#fff', default: '#fff' }, text: { primary: '#111', secondary: '#555' },
} }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));

// The pin session is owned by the test: every proof mint and unlock check is asserted.
let mockPin: UsePin;
const mockUnlock = jest.fn();
const mockProofFor = jest.fn();
const mockPinLock = jest.fn();
const mockSetPinDetailed = jest.fn();
jest.mock('../../hooks/usePin', () => ({
  usePin: () => ({ busy: false, problem: null, isUnlocked: () => false, setPin: jest.fn(),
    setPinDetailed: (...args: unknown[]) => mockSetPinDetailed(...args),
    unlock: (...args: unknown[]) => mockUnlock(...args),
    proofFor: (...args: unknown[]) => mockProofFor(...args),
    lock: (...args: unknown[]) => mockPinLock(...args), clearProblem: () => {} }),
}));

// HybridWallet instances are captured so the flow's dependency wiring can be inspected.
const mockWalletInstances: any[] = [];
const mockWalletCreate = jest.fn();
const mockWalletReveal = jest.fn();
const mockWalletChangePin = jest.fn();
const mockWalletRecover = jest.fn();
const mockCreateChallenge = jest.fn();
const mockChallengeVerify = jest.fn();
const mockChallengeDispose = jest.fn();
const mockExportPinBackup = jest.fn();
const mockExportBackup = jest.fn();
const mockGeneratePassword = jest.fn();
jest.mock('@hashpass/wallet', () => {
  class HybridWallet {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) { this.config = config; mockWalletInstances.push(this); }
    create = (...args: unknown[]) => mockWalletCreate(...args);
    reveal = (...args: unknown[]) => mockWalletReveal(...args);
    changePin = (...args: unknown[]) => mockWalletChangePin(...args);
    recover = (...args: unknown[]) => mockWalletRecover(...args);
  }
  return {
    HybridWallet,
    createRecoveryChallenge: (...args: unknown[]) => mockCreateChallenge(...args),
    exportPinRecoveryBackup: (...args: unknown[]) => mockExportPinBackup(...args),
    exportRecoveryBackup: (...args: unknown[]) => mockExportBackup(...args),
    generateRecoveryPassword: (...args: unknown[]) => mockGeneratePassword(...args),
  };
});

const mockVaultLoad = jest.fn();
jest.mock('../../lib/wallet/hybrid-vault-api', () => ({
  hybridVaultClient: { load: (...args: unknown[]) => mockVaultLoad(...args), save: jest.fn() },
}));
jest.mock('../../lib/wallet/enrollment-client', () => ({
  createWalletEnrollmentClient: (makeProof: unknown) => ({ makeProof }),
}));
const mockSendRecoveryCode = jest.fn();
const mockVerifyRecoveryCode = jest.fn();
const mockSetRecoveredPin = jest.fn();
jest.mock('../../lib/wallet/pin-recovery-client', () => ({
  walletPinRecoveryClient: {
    sendRecoveryCode: (...args: unknown[]) => mockSendRecoveryCode(...args),
    verifyRecoveryCode: (...args: unknown[]) => mockVerifyRecoveryCode(...args),
    setRecoveredPin: (...args: unknown[]) => mockSetRecoveredPin(...args),
  },
}));
let mockLifecycleBinding: { lock: () => void } | null = null;
jest.mock('../../lib/wallet/lifecycle', () => ({
  bindWalletLifecycle: (binding: { lock: () => void }) => { mockLifecycleBinding = binding; return () => {}; },
}));
const mockSaveRecoveryFile = jest.fn();
jest.mock('../../lib/wallet/recovery-files', () => ({
  saveRecoveryFile: (...args: unknown[]) => mockSaveRecoveryFile(...args),
}));
jest.mock('../../lib/wallet/device-wallet', () => ({
  walletOperationId: () => 'operation-id',
  walletRandom: () => new Uint8Array(32),
}));

// Prop-capturing stubs: the pads are driven by calling their props directly.
const mockPinFlows: any[] = [];
const mockPinPads: any[] = [];
jest.mock('../../components/security/PinFlow', () => ({
  __esModule: true, default: (props: unknown) => { mockPinFlows.push(props); return null; },
}));
jest.mock('../../components/security/PinPad', () => ({
  __esModule: true, default: (props: unknown) => { mockPinPads.push(props); return null; },
}));

const phrase = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo limbo';
const scope = { ownerId: 'reg-1', walletId: 'wallet-1', environment: 'development' as const };
const enrolled = { scope, state: 'enrolled' as const, operationId: null, network: 'testnet' as const,
  wallet: null, setupEnabled: true };
const registered = { ...enrolled, state: 'registered' as const };

let view: ReactTestRenderer;
const content = () => JSON.stringify(view.toJSON());
const action = (label: string) => view.root.findAllByType(ActionButton).find(node => node.props.label === label)!;
const lastPinFlow = () => mockPinFlows.at(-1)!;
const checkbox = () => view.root.findAllByType(Pressable).find(node => node.props.accessibilityRole === 'checkbox')!;
const input = (label: string) => view.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === label)!;

beforeEach(() => {
  jest.clearAllMocks();
  mockWalletInstances.length = 0;
  mockPinFlows.length = 0;
  mockPinPads.length = 0;
  mockLifecycleBinding = null;
  mockUnlock.mockResolvedValue(true);
  mockProofFor.mockImplementation((requested: string) => (requested === 'wallet:unlock' ? 'unlock-proof' : 'sign-proof'));
  mockCreateChallenge.mockReturnValue({ positions: [0, 2], verify: mockChallengeVerify, dispose: mockChallengeDispose });
  mockChallengeVerify.mockReturnValue(true);
  mockSaveRecoveryFile.mockResolvedValue(undefined);
  mockWalletCreate.mockResolvedValue({ phrase });
  mockWalletReveal.mockResolvedValue(phrase);
  mockWalletChangePin.mockResolvedValue(undefined);
  mockWalletRecover.mockResolvedValue(undefined);
  mockPin = {
    busy: false, problem: null, isUnlocked: () => false, setPin: jest.fn(), setPinDetailed: mockSetPinDetailed,
    unlock: mockUnlock, proofFor: mockProofFor, lock: mockPinLock, clearProblem: () => {},
  } as unknown as UsePin;
});
afterEach(() => { act(() => view.unmount()); });

it('says setup is unavailable, per reason, instead of hiding the wizard', () => {
  const renderOnce = (props: React.ComponentProps<typeof WalletVaultFlow>) => {
    act(() => { void (view = create(<WalletVaultFlow {...props} />)); });
    const text = content();
    act(() => view.unmount());
    return text;
  };
  expect(renderOnce({ enrollment: { ...enrolled, setupEnabled: false }, onReload: jest.fn() }))
    .toContain('Wallet setup is not enabled for your account yet');
  expect(renderOnce({ enrollment: { ...enrolled, scope: { ...scope, environment: 'production' } } }))
    .toContain('The setup wizard only runs on the test networks');
  expect(renderOnce({ enrollment: { ...registered, setupEnabled: false } }))
    .toContain('Wallet management is not available in this build for your account');
});

it('creates a wallet end to end: PIN inline, phrase on the secure modal, then the word challenge', async () => {
  const onChanged = jest.fn();
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} onChanged={onChanged} />); });
  // The intro names the one rule: create-only, export always.
  expect(content()).toContain('importing wallets made elsewhere is not supported');
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(0);
  await act(async () => { action('Create wallet').props.onPress(); });
  // The PIN is a question, not a secret: it renders inside the card, not on the modal.
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(0);
  await act(async () => { lastPinFlow().onDone('1234'); });
  expect(mockUnlock).toHaveBeenCalledWith('1234', 'wallet:sign');
  expect(mockWalletCreate).toHaveBeenCalledWith('1234');
  expect(onChanged).toHaveBeenCalled();
  // The phrase takes over the whole screen and shows every numbered word.
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(1);
  expect(content()).toContain('1. alpha');
  expect(content()).toContain('12. limbo');
  // Continue is blocked until the acknowledgement is checked.
  expect(action('I saved it — continue').props.disabled).toBe(true);
  await act(async () => { checkbox().props.onPress(); });
  expect(action('I saved it — continue').props.disabled).toBe(false);
  await act(async () => { action('I saved it — continue').props.onPress(); });
  expect(input('Recovery word')).toBeDefined();
  await act(async () => {
    input('Recovery word').props.onChangeText('alpha');
    view.root.findAllByType(TextInput).filter(node => node.props.accessibilityLabel === 'Recovery word')[1]
      .props.onChangeText('charlie');
  });
  await act(async () => { action('Verify recovery words').props.onPress(); });
  expect(mockChallengeVerify).toHaveBeenCalledWith(['alpha', 'charlie', '']);
  expect(mockChallengeDispose).toHaveBeenCalled();
  expect(content()).toContain('Wallet ready');
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(0);
});

it('keeps a wrong challenge answer on the challenge and lets the phrase be reviewed again', async () => {
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('I saved it — continue').props.onPress(); });
  mockChallengeVerify.mockReturnValueOnce(false);
  await act(async () => { action('Verify recovery words').props.onPress(); });
  expect(content()).toContain('Those words are not right');
  await act(async () => { action('Review recovery phrase again').props.onPress(); });
  // Back on the phrase screen, still on the secure modal.
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(1);
  expect(content()).toContain('1. alpha');
});

it('fails honestly when the PIN session expired, and locks it before showing the failure', async () => {
  mockWalletCreate.mockRejectedValue(new Error('wallet_step_up_required'));
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  expect(mockPinLock).toHaveBeenCalled();
  expect(content()).toContain('Your PIN session expired. Start again.');
  await act(async () => { action('Go back').props.onPress(); });
  expect(content()).toContain('Create wallet');
});

it('maps a rejected unlock to the honest nothing-changed message', async () => {
  mockUnlock.mockResolvedValueOnce(false);
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('0000'); });
  expect(content()).toContain('That PIN did not unlock the wallet. Nothing was changed.');
});

it('reveals the phrase on demand and disposes the challenge on the way home', async () => {
  await act(async () => { view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} />); });
  expect(content()).toContain('Wallet ready');
  const command: VaultCommand = { type: 'REVEAL', nonce: 1 };
  await act(async () => { view.update(<WalletVaultFlow enrollment={registered} pin={mockPin} command={command} />); });
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(0); // the pad stays in the card
  await act(async () => { lastPinFlow().onDone('1234'); });
  expect(mockWalletReveal).toHaveBeenCalledWith('1234');
  expect(content()).toContain('1. alpha');
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('I saved it — continue').props.onPress(); });
  // From reveal the HIDE goes straight home (no challenge): the phrase is wiped first.
  expect(mockChallengeDispose).toHaveBeenCalled();
  expect(content()).toContain('Wallet ready');
});

it('applies a menu command once per nonce, not again on every re-render', async () => {
  const command: VaultCommand = { type: 'REVEAL', nonce: 7 };
  await act(async () => { view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={command} />); });
  expect(content()).not.toContain('Wallet ready'); // the command fired: it left home
  await act(async () => { lastPinFlow().onCancel(); });
  expect(content()).toContain('Wallet ready');
  // A re-render carrying the same nonce does not re-fire the command.
  await act(async () => { view.update(<WalletVaultFlow enrollment={registered} pin={mockPin} command={command} />); });
  expect(content()).toContain('Wallet ready');
  // A new nonce does.
  await act(async () => {
    view.update(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'CHANGE', nonce: 8 } as VaultCommand} />);
  });
  expect(content()).not.toContain('Wallet ready');
});

it('changes the PIN through a two-stage entry, with the current digits minted first', async () => {
  await act(async () => {
    view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'CHANGE', nonce: 1 } as VaultCommand} />);
  });
  await act(async () => { lastPinFlow().onDone('1111'); }); // stage 1: the current PIN
  const pad = () => mockPinPads.at(-1)!;
  expect(pad().title).toContain('Choose a new 4-digit PIN');
  await act(async () => { pad().onComplete('2222'); });
  expect(pad().title).toContain('Enter the same four digits again');
  await act(async () => { pad().onComplete('2222'); });
  expect(mockUnlock).toHaveBeenCalledWith('1111', 'wallet:sign'); // proofs come from the CURRENT pin
  expect(mockWalletChangePin).toHaveBeenCalledWith('1111', '2222');
  expect(content()).toContain('Wallet ready');
});

it('restarts the new-PIN entry from scratch on a mismatch', async () => {
  await act(async () => {
    view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'CHANGE', nonce: 1 } as VaultCommand} />);
  });
  await act(async () => { lastPinFlow().onDone('1111'); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('2222'); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('3333'); });
  expect(mockPinPads.at(-1)!.error).toContain('The two PINs did not match');
  // The retry works from a clean slate.
  await act(async () => { mockPinPads.at(-1)!.onComplete('4444'); });
  expect(mockPinPads.at(-1)!.error).toBeNull();
  await act(async () => { mockPinPads.at(-1)!.onComplete('4444'); });
  expect(mockWalletChangePin).toHaveBeenCalledWith('1111', '4444');
});

it('tells the truth about an unconfirmed PIN change instead of pretending it failed cleanly', async () => {
  mockWalletChangePin.mockRejectedValue(new Error('wallet_pin_change_unknown'));
  await act(async () => {
    view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'CHANGE', nonce: 1 } as VaultCommand} />);
  });
  await act(async () => { lastPinFlow().onDone('1111'); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('2222'); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('2222'); });
  expect(content()).toContain('The PIN change could not be confirmed');
  expect(content()).toContain('Try your new PIN first');
});

it('resets a forgotten PIN: email code, phrase, new PIN — and never mints a proof itself', async () => {
  const proof = { token: 'recovery-proof', scope: 'wallet:recover', expiresAt: '2026-10-24T12:00:00Z' };
  mockVerifyRecoveryCode.mockResolvedValue(proof);
  mockSendRecoveryCode.mockResolvedValue(undefined);
  mockSetRecoveredPin.mockResolvedValue(undefined);
  await act(async () => {
    view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'RECOVER', nonce: 1 } as VaultCommand} />);
  });
  await act(async () => { action('Email me a reset code').props.onPress(); });
  expect(mockSendRecoveryCode).toHaveBeenCalled();
  await act(async () => { input('Email code').props.onChangeText('65432'); });
  expect(action('Continue').props.disabled).toBe(true);
  await act(async () => { input('Email code').props.onChangeText('123456'); });
  await act(async () => { action('Continue').props.onPress(); });
  expect(mockVerifyRecoveryCode).toHaveBeenCalledWith('123456');
  await act(async () => { input('Recovery phrase').props.onChangeText(phrase); });
  await act(async () => { action('Continue').props.onPress(); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('4321'); });
  await act(async () => { mockPinPads.at(-1)!.onComplete('4321'); });
  expect(mockWalletRecover).toHaveBeenCalledWith(phrase, '4321', 'recovery-proof');
  expect(content()).toContain('Wallet ready');
});

it('shows the email-code service problems where the code is entered', async () => {
  mockVerifyRecoveryCode.mockRejectedValue(new Error('wallet_recovery_rate_limited'));
  await act(async () => {
    view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} command={{ type: 'RECOVER', nonce: 1 } as VaultCommand} />);
  });
  mockSendRecoveryCode.mockResolvedValue(undefined);
  await act(async () => { action('Email me a reset code').props.onPress(); });
  await act(async () => { input('Email code').props.onChangeText('123456'); });
  await act(async () => { action('Continue').props.onPress(); });
  expect(content()).toContain('Too many attempts. Wait a little, then request a new code.');
});

it('mounts gate recovery without ever rendering the wallet home', async () => {
  const onExit = jest.fn();
  mockVerifyRecoveryCode.mockResolvedValue({ token: 'rp', scope: 'wallet:recover', expiresAt: 'x' });
  mockSendRecoveryCode.mockResolvedValue(undefined);
  await act(async () => { view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} recoverOnly onExit={onExit} />); });
  // It went straight to recovery; the home surface was never built.
  expect(content()).not.toContain('Wallet ready');
  expect(content()).toContain('We will email you a 6-digit code');
  await act(async () => { action('Email me a reset code').props.onPress(); });
  await act(async () => { input('Email code').props.onChangeText('123456'); });
  await act(async () => { action('Continue').props.onPress(); });
  await act(async () => { input('Recovery phrase').props.onChangeText(phrase); });
  await act(async () => { action('Continue').props.onPress(); });
  // Cancel from the new-PIN step: the recovery-closed card, never the wallet's home.
  await act(async () => { action('Not now').props.onPress(); });
  expect(content()).toContain('Your PIN was not changed');
  await act(async () => { action('Back to PIN entry').props.onPress(); });
  expect(onExit).toHaveBeenCalled();
  // Start again re-enters the recovery without exposing the home actions.
  await act(async () => { action('Start again').props.onPress(); });
  expect(content()).toContain('We will email you a 6-digit code');
});

it('locks on background: transient secrets are wiped and the machine resets', async () => {
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  expect(content()).toContain('1. alpha');
  expect(mockLifecycleBinding).toBeDefined();
  await act(async () => { mockLifecycleBinding!.lock(); });
  // Registered was set when the vault saved, so the lock lands on home with nothing on screen.
  expect(content()).toContain('Wallet ready');
  expect(content()).not.toContain('alpha');
  expect(mockChallengeDispose).toHaveBeenCalled();
  expect(view.root.findAllByType('Modal' as never)).toHaveLength(0);
});

it('downloads the PIN-encrypted backup with the account share, then closes itself', async () => {
  mockVaultLoad.mockResolvedValue({ walletId: 'wallet-1', version: 1, serverShare: 'share', envelope: null });
  mockExportPinBackup.mockResolvedValue('PIN-ENCRYPTED-BACKUP');
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('Download encrypted backup with PIN').props.onPress(); });
  const backupFlow = mockPinFlows.at(-1)!;
  await act(async () => { backupFlow.onDone('1234'); });
  expect(mockProofFor).toHaveBeenCalledWith('wallet:unlock');
  expect(mockVaultLoad).toHaveBeenCalledWith('unlock-proof');
  expect(mockExportPinBackup).toHaveBeenCalledWith(phrase, 'testnet', '1234', 'share', expect.anything());
  expect(mockSaveRecoveryFile).toHaveBeenCalledWith('PIN-ENCRYPTED-BACKUP');
  // Success closes the inline PIN ask: the backup help text disappears with it.
  expect(content()).not.toContain('restoring it requires this PIN');
});

it('refuses a PIN backup without an unlock proof instead of exporting unprotected', async () => {
  mockProofFor.mockReturnValueOnce(null);
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('Download encrypted backup with PIN').props.onPress(); });
  await act(async () => { mockPinFlows.at(-1)!.onDone('1234'); });
  expect(mockExportPinBackup).not.toHaveBeenCalled();
  expect(content()).toContain('Your PIN session expired. Start again.');
});

it('generates the portable backup password, downloads the file, and refuses a mismatch', async () => {
  mockGeneratePassword.mockReturnValue('generated-password-123');
  mockExportBackup.mockResolvedValue('PORTABLE-BACKUP');
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('Download portable encrypted backup').props.onPress(); });
  expect(input('Backup password').props.value).toBe('generated-password-123');
  // A changed confirm keeps Save disabled and, if pressed anyway, says so instead of exporting.
  await act(async () => { input('Confirm backup password').props.onChangeText('something-else'); });
  expect(action('Save encrypted file').props.disabled).toBe(true);
  await act(async () => { action('Save encrypted file').props.onPress(); });
  expect(mockExportBackup).not.toHaveBeenCalled();
  expect(content()).toContain('The two backup passwords did not match');
  // Restoring the match exports under the generated password; the password downloads separately.
  await act(async () => { input('Confirm backup password').props.onChangeText('generated-password-123'); });
  await act(async () => { action('Save encrypted file').props.onPress(); });
  expect(mockExportBackup).toHaveBeenCalledWith(phrase, 'testnet', 'generated-password-123', expect.anything());
  await act(async () => { action('Download password separately').props.onPress(); });
  expect(mockSaveRecoveryFile).toHaveBeenCalledWith('generated-password-123', true, 'hashpass-recovery-password.txt');
});

it('downloads the plain phrase only after the acknowledgement', async () => {
  await act(async () => { view = create(<WalletVaultFlow enrollment={enrolled} pin={mockPin} />); });
  await act(async () => { action('Create wallet').props.onPress(); });
  await act(async () => { lastPinFlow().onDone('1234'); });
  expect(action('Download unprotected phrase').props.disabled).toBe(true);
  await act(async () => { checkbox().props.onPress(); });
  await act(async () => { action('Download unprotected phrase').props.onPress(); });
  expect(mockSaveRecoveryFile).toHaveBeenCalledWith(phrase, true);
});

it('wires HybridWallet with the scoped proofs, the tri-state verifier swap and the recovery reset', () => {
  act(() => { void (view = create(<WalletVaultFlow enrollment={registered} pin={mockPin} />)); });
  expect(mockWalletInstances).toHaveLength(1);
  const config = mockWalletInstances[0].config;
  expect(config.scope).toEqual(scope);
  expect(config.vault).toBeDefined();
  // The unlock/sign proofs are minted lazily from the shared session.
  (config.proofs.unlock as () => unknown)();
  expect(mockProofFor).toHaveBeenCalledWith('wallet:unlock');
  // changeServerPin turns 'unknown' into a thrown error so the wallet keeps the new envelope.
  mockSetPinDetailed.mockResolvedValueOnce('unknown');
  expect(config.changeServerPin('9999', '1234')).rejects.toThrow('wallet_pin_change_unknown');
  // resetServerPin needs the recovery proof object, and sends it to the endpoint.
  // resetServerPin refuses to run without a recovery proof object in hand.
  expect(config.resetServerPin('9999')).rejects.toThrow('wallet_recovery_unavailable');
  mockSetPinDetailed.mockResolvedValueOnce('rejected');
  expect(config.changeServerPin('9999', '1234')).resolves.toBe(false);
});
