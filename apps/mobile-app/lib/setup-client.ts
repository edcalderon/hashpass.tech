import { apiClient } from './api-client';
import type { PinVerification } from '../types/pin.types';
import type { PinOutcome, SetupPatch, UserSetup } from '../types/setup';
import type { StepUpScope } from '../types/step-up.types';

export type { PinVerification };

/** Every setup route is global (no event segment) and must never be replayed: a retry would be a second PIN guess. */
const REQUEST = { skipEventSegment: true, retries: 0 } as const;

export class SetupRequestError extends Error {
  constructor(readonly code: string, readonly status?: number) {
    super(code);
    this.name = 'SetupRequestError';
  }
}

/**
 * `apiClient` never throws on a failed response and wraps the server body, so a
 * successful call is `{ success: true, data: { success, data } }`. Unwrap both levels
 * here, once, so callers deal in payloads and `SetupRequestError`s only.
 */
function unwrap<T>(response: Awaited<ReturnType<typeof apiClient.get>>): T {
  if (!response.success) throw new SetupRequestError(response.error || 'unavailable', response.status);
  const body = response.data as { success?: unknown; data?: T; error?: unknown } | null | undefined;
  if (!body || body.success !== true || body.data === undefined || body.data === null) {
    throw new SetupRequestError(typeof body?.error === 'string' ? body.error : 'unexpected_response');
  }
  return body.data;
}

export const fetchSetup = async (): Promise<UserSetup> => unwrap<UserSetup>(await apiClient.get('setup', REQUEST));

export const saveSetup = async (patch: SetupPatch): Promise<UserSetup> =>
  unwrap<UserSetup>(await apiClient.post('setup', patch, REQUEST));

/** Creates a PIN, or changes it when `currentPin` is given. The PIN goes in the request body only. */
export const requestSetPin = async (pin: string, currentPin?: string): Promise<PinOutcome> =>
  unwrap<PinOutcome>(await apiClient.post('setup/pin', { action: 'set', pin, ...(currentPin ? { currentPin } : {}) }, REQUEST));

/** A wrong PIN is a normal answer (`ok: false` with the attempts left), not a thrown error. */
export const requestVerifyPin = async (pin: string, scope: StepUpScope): Promise<PinVerification> =>
  unwrap<PinVerification>(await apiClient.post('setup/pin', { action: 'verify', pin, scope }, REQUEST));
