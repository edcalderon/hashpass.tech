/**
 * Step-up proofs: what a sensitive action accepts as a fresh second factor.
 * Shared by the client session store (lib/step-up-session.ts) and the server
 * proof minter/verifier (lib/server/pin-auth.ts). See
 * apps/docs/docs/auth/SECOND_FACTOR_PIN.md.
 */
export type StepUpScope = 'app:unlock' | 'wallet:sign';

export interface StepUpProof { token: string; scope: StepUpScope; expiresAt: string }

/** Claims inside the signed proof token. Not a session: user-, scope- and time-bound. */
export interface StepUpClaims { v: 1; sub: string; scope: StepUpScope; iat: number; exp: number; jti: string }
