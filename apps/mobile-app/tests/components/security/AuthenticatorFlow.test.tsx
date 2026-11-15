import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AuthenticatorFlow from '../../../components/security/AuthenticatorFlow';
import { clearAuthenticator, authenticatorProof } from '../../../lib/authenticator-session';
const mockStatus = jest.fn(), mockBegin = jest.fn(), mockSendSetupCode = jest.fn(), mockVerify = jest.fn();
let mockOwner = 'alice';
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@hashpass/ui/primitives', () => ({ Surface: 'Surface', FormField: 'FormField', ActionButton: 'ActionButton' }));
jest.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: mockOwner }) }));
jest.mock('../../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../../lib/authenticator-client', () => ({
  authenticatorStatus: () => mockStatus(), beginAuthenticator: (...args: unknown[]) => mockBegin(...args),
  sendAuthenticatorSetupCode: (...args: unknown[]) => mockSendSetupCode(...args),
  verifyAuthenticator: (...args: unknown[]) => mockVerify(...args),
}));
const proof = () => ({ token: 'verified', expiresAt: new Date(Date.now() + 60000).toISOString() });
const button = (view: ReactTestRenderer, label: string) => view.root.findAllByType('ActionButton' as never).find(node => node.props.label === label)!;
async function mount(scope: 'access' | 'critical' = 'access', pinProof: string | null = 'pin', onUnenrolled?: () => void) {
  let view!: ReactTestRenderer; const onDone = jest.fn();
  await act(async () => { view = create(<AuthenticatorFlow scope={scope} pinProof={pinProof} onDone={onDone} onUnenrolled={onUnenrolled} />); });
  return { view, onDone };
}
async function submit(view: ReactTestRenderer, code = '123456') {
  const fields = view.root.findAllByType('FormField' as never);
  if (button(view, 'Confirm setup')) {
    await act(async () => fields[0].props.onChangeText('654321'));
    await act(async () => fields[1].props.onChangeText(code));
    await act(async () => button(view, 'Confirm setup').props.onPress());
  } else {
    await act(async () => fields[0].props.onChangeText(code));
    await act(async () => button(view, 'Verify code').props.onPress());
  }
}
beforeEach(() => {
  jest.clearAllMocks(); clearAuthenticator(); mockOwner = 'alice';
  mockStatus.mockResolvedValue({ enabled: true });
  mockBegin.mockResolvedValue({ secret: 'MANUALKEY', uri: 'otpauth://totp/HASHPASS?secret=MANUALKEY', emailHint: 'a***@example.com', emailStatus: 'sent' });
  mockSendSetupCode.mockResolvedValue({ emailHint: 'a***@example.com' });
  mockVerify.mockImplementation(async () => ({ proof: proof() }));
});
afterEach(() => clearAuthenticator());
it('enrolls, shows QR and manual key, and requires recovery backup acknowledgment', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  mockVerify.mockResolvedValue({ proof: proof(), recoveryCodes: ['recovery-one'] });
  const { view, onDone } = await mount();
  expect(mockBegin).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain('PIN-only access is available. Add an authenticator for stronger security and PIN recovery.');
  await act(async () => button(view, 'Set up authenticator').props.onPress());
  expect(mockBegin).toHaveBeenCalledWith('pin');
  expect(mockSendSetupCode).not.toHaveBeenCalled();
  expect(view.root.findByType('QRCode' as never).props.value).toContain('otpauth://');
  await submit(view);
  expect(mockVerify).toHaveBeenCalledWith('123456', 'access', true, 'pin', '654321');
  expect(onDone).not.toHaveBeenCalled(); expect(authenticatorProof('alice', 'access')).toBeNull();
  await act(async () => button(view, 'I saved my recovery codes').props.onPress());
  expect(onDone).toHaveBeenCalledTimes(1); expect(authenticatorProof('alice', 'access')).toBe('verified');
  act(() => view.unmount());
});
it('continues with the PIN when authenticator setup is skipped', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  const { view, onDone } = await mount();
  expect(mockBegin).not.toHaveBeenCalled();
  expect(authenticatorProof('alice', 'access')).toBeNull();
  await act(async () => button(view, 'Continue with PIN').props.onPress());
  expect(onDone).toHaveBeenCalledWith('pin');
  expect(authenticatorProof('alice', 'access')).toBeNull();
  expect(mockVerify).not.toHaveBeenCalled();
  act(() => view.unmount());
});
it('keeps the wallet locked when authenticator status cannot be confirmed', async () => {
  mockStatus.mockRejectedValue(new Error('unavailable'));
  const { view, onDone } = await mount();

  expect(JSON.stringify(view.toJSON())).toContain('Wallet & Contacts stay locked until we can confirm your security status.');
  expect(view.root.findAllByType('ActionButton' as never).map(node => node.props.label)).toEqual(['Try again']);
  expect(onDone).not.toHaveBeenCalled();
  act(() => view.unmount());
});
it('keeps PIN-only access available when setup fails after status confirms no enrollment', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  mockBegin.mockRejectedValue(new Error('unavailable'));
  const { view, onDone } = await mount();

  await act(async () => button(view, 'Set up authenticator').props.onPress());

  expect(JSON.stringify(view.toJSON())).toContain('PIN-only access remains available.');
  await act(async () => button(view, 'Continue with PIN').props.onPress());
  expect(onDone).toHaveBeenCalledWith('pin');
  act(() => view.unmount());
});
it('keeps authenticator setup open and PIN access available if setup email delivery fails', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  mockBegin.mockResolvedValue({ secret: 'MANUALKEY', uri: 'otpauth://totp/HASHPASS?secret=MANUALKEY', emailHint: 'a***@example.com', emailStatus: 'unavailable' });
  const { view, onDone } = await mount();

  await act(async () => button(view, 'Set up authenticator').props.onPress());

  expect(view.root.findByType('QRCode' as never).props.value).toContain('otpauth://');
  expect(JSON.stringify(view.toJSON())).toContain('Setup is ready, but we could not send the email code.');
  expect(mockSendSetupCode).not.toHaveBeenCalled();
  await act(async () => button(view, 'Continue with PIN').props.onPress());
  expect(onDone).toHaveBeenCalledWith('pin');
  act(() => view.unmount());
});
it('requires a new code for each critical action and accepts normalized recovery input', async () => {
  const { view, onDone } = await mount('critical');
  expect(mockVerify).not.toHaveBeenCalled();
  await submit(view, 'ABCD-EF01-2345-6789');
  expect(mockVerify).toHaveBeenCalledWith('abcdef0123456789', 'critical', false, 'pin', undefined);
  expect(onDone).toHaveBeenCalledTimes(1); expect(authenticatorProof('alice', 'access')).toBeNull();
  act(() => view.unmount());
});
it('fails closed on rejection and clears entered codes', async () => {
  mockVerify.mockRejectedValue(new Error('invalid_expired_or_used_code'));
  const { view, onDone } = await mount(); await submit(view);
  expect(onDone).not.toHaveBeenCalled(); expect(authenticatorProof('alice', 'access')).toBeNull();
  expect(view.root.findByType('FormField' as never).props.value).toBe('');
  expect(JSON.stringify(view.toJSON())).toContain('Code not accepted'); act(() => view.unmount());
});
it('cannot enroll without a recent PIN proof', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  const { view, onDone } = await mount('access', null);
  expect(mockBegin).not.toHaveBeenCalled(); expect(onDone).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain('No authenticator is enrolled');
  expect(view.root.findAllByType('ActionButton' as never).some(node => node.props.label === 'Continue with PIN')).toBe(false);
  act(() => view.unmount());
});
it('opens PIN recovery without a PIN proof only after confirming no authenticator is enrolled', async () => {
  const onUnenrolled = jest.fn();
  mockStatus.mockResolvedValue({ enabled: false });
  const unenrolled = await mount('critical', null, onUnenrolled);
  expect(onUnenrolled).toHaveBeenCalledTimes(1);
  expect(unenrolled.view.root.findAllByType('FormField' as never)).toHaveLength(0);
  expect(unenrolled.onDone).not.toHaveBeenCalled();
  act(() => unenrolled.view.unmount());

  mockStatus.mockResolvedValue({ enabled: true });
  const enrolled = await mount('critical', null, onUnenrolled);
  expect(onUnenrolled).toHaveBeenCalledTimes(1);
  expect(enrolled.view.root.findAllByType('FormField' as never)).toHaveLength(1);
  expect(JSON.stringify(enrolled.view.toJSON())).toContain('Confirm this sensitive action');
  act(() => enrolled.view.unmount());
});
it('does not publish a verification response after unmount', async () => {
  let resolve!: (value: unknown) => void;
  mockVerify.mockReturnValue(new Promise(done => { resolve = done; }));
  const { view, onDone } = await mount(); await submit(view); act(() => view.unmount());
  await act(async () => resolve({ proof: proof() }));
  expect(onDone).not.toHaveBeenCalled(); expect(authenticatorProof('alice', 'access')).toBeNull();
});
