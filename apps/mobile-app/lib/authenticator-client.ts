import { apiClient } from './api-client';
import type { AuthenticatorEmailChallenge, AuthenticatorEnrollment, AuthenticatorResult, AuthenticatorScope, AuthenticatorStatus } from '../types/authenticator.types';

const options = { skipEventSegment: true, retries: 0 } as const;
function unwrap<T>(result: Awaited<ReturnType<typeof apiClient.get>>): T {
  const body = result.data as { success?: boolean; data?: T; error?: string } | undefined;
  if (!result.success || body?.success !== true || !body.data) throw new Error(body?.error ?? result.error ?? 'unavailable');
  return body.data;
}
export const authenticatorStatus = async () => unwrap<AuthenticatorStatus>(await apiClient.get('setup/authenticator', options));
export const beginAuthenticator = async (pinProof: string) => unwrap<AuthenticatorEnrollment>(await apiClient.post('setup/authenticator',
  { action: 'begin' }, { ...options, headers: { 'X-Hashpass-Step-Up': pinProof } }));
export const sendAuthenticatorSetupCode = async (pinProof: string) => unwrap<AuthenticatorEmailChallenge>(await apiClient.post('setup/authenticator',
  { action: 'send-setup-code' }, { ...options, headers: { 'X-Hashpass-Step-Up': pinProof } }));
export const verifyAuthenticator = async (code: string, scope: AuthenticatorScope, enrolling: boolean, pinProof?: string | null, emailCode?: string) =>
  unwrap<AuthenticatorResult>(await apiClient.post('setup/authenticator', { action: enrolling ? 'confirm' : 'verify', code, scope, ...(emailCode ? { emailCode } : {}) },
    { ...options, headers: pinProof ? { 'X-Hashpass-Step-Up': pinProof } : {} }));
