import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import AuthenticatorFlow from '../../../components/security/AuthenticatorFlow';
import { clearAuthenticator, authenticatorProof } from '../../../lib/authenticator-session';
const mockStatus = jest.fn(), mockBegin = jest.fn(), mockVerify = jest.fn();
let mockOwner = 'alice';
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('@hashpass/ui/primitives', () => ({ Surface: 'Surface', FormField: 'FormField', ActionButton: 'ActionButton' }));
jest.mock('../../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: mockOwner }) }));
jest.mock('../../../hooks/useTheme', () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock('../../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../../lib/authenticator-client', () => ({
  authenticatorStatus: () => mockStatus(), beginAuthenticator: (...args: unknown[]) => mockBegin(...args),
  verifyAuthenticator: (...args: unknown[]) => mockVerify(...args),
}));
const proof = () => ({ token: 'verified', expiresAt: new Date(Date.now() + 60000).toISOString() });
const button = (view: ReactTestRenderer, label: string) => view.root.findAllByType('ActionButton' as never).find(node => node.props.label === label)!;
async function mount(scope: 'access' | 'critical' = 'access', pinProof: string | null = 'pin') {
  let view!: ReactTestRenderer; const onDone = jest.fn();
  await act(async () => { view = create(<AuthenticatorFlow scope={scope} pinProof={pinProof} onDone={onDone} />); });
  return { view, onDone };
}
async function submit(view: ReactTestRenderer, code = '123456') {
  await act(async () => view.root.findByType('FormField' as never).props.onChangeText(code));
  await act(async () => button(view, 'Verify code').props.onPress());
}
beforeEach(() => {
  jest.clearAllMocks(); clearAuthenticator(); mockOwner = 'alice';
  mockStatus.mockResolvedValue({ enabled: true });
  mockBegin.mockResolvedValue({ secret: 'MANUALKEY', uri: 'otpauth://totp/HASHPASS?secret=MANUALKEY' });
  mockVerify.mockImplementation(async () => ({ proof: proof() }));
});
afterEach(() => clearAuthenticator());
it('enrolls, shows QR and manual key, and requires recovery backup acknowledgment', async () => {
  mockStatus.mockResolvedValue({ enabled: false });
  mockVerify.mockResolvedValue({ proof: proof(), recoveryCodes: ['recovery-one'] });
  const { view, onDone } = await mount();
  expect(mockBegin).toHaveBeenCalledWith('pin');
  expect(view.root.findByType('QRCode' as never).props.value).toContain('otpauth://');
  await submit(view);
  expect(mockVerify).toHaveBeenCalledWith('123456', 'access', true, 'pin');
  expect(onDone).not.toHaveBeenCalled(); expect(authenticatorProof('alice', 'access')).toBeNull();
  await act(async () => button(view, 'I saved my recovery codes').props.onPress());
  expect(onDone).toHaveBeenCalledTimes(1); expect(authenticatorProof('alice', 'access')).toBe('verified');
  act(() => view.unmount());
});
it('requires a new code for each critical action and accepts normalized recovery input', async () => {
  const { view, onDone } = await mount('critical');
  expect(mockVerify).not.toHaveBeenCalled();
  await submit(view, 'ABCD-EF01-2345-6789');
  expect(mockVerify).toHaveBeenCalledWith('abcdef0123456789', 'critical', false, 'pin');
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
  expect(JSON.stringify(view.toJSON())).toContain('Authenticator setup is unavailable'); act(() => view.unmount());
});
it('does not publish a verification response after unmount', async () => {
  let resolve!: (value: unknown) => void;
  mockVerify.mockReturnValue(new Promise(done => { resolve = done; }));
  const { view, onDone } = await mount(); await submit(view); act(() => view.unmount());
  await act(async () => resolve({ proof: proof() }));
  expect(onDone).not.toHaveBeenCalled(); expect(authenticatorProof('alice', 'access')).toBeNull();
});
