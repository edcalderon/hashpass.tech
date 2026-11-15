import type { AuthenticatorProof, AuthenticatorScope } from '../types/authenticator.types';

export const AUTHENTICATOR_HEADER = 'X-Hashpass-Authenticator';
let owner: string | null = null;
const proofs = new Map<AuthenticatorScope, AuthenticatorProof>();
let activeChallenges = 0;

/** Keep the current protected flow mounted across an authenticator-app handoff. */
export function beginAuthenticatorChallenge() {
  activeChallenges += 1;
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    activeChallenges = Math.max(0, activeChallenges - 1);
  };
}

export function hasActiveAuthenticatorChallenge() {
  return activeChallenges > 0;
}

export function rememberAuthenticator(userId: string, scope: AuthenticatorScope, proof: AuthenticatorProof) {
  if (owner !== userId) proofs.clear();
  owner = userId; proofs.set(scope, proof);
}
export function authenticatorProof(userId: string | null, scope: AuthenticatorScope): string | null {
  if (!userId || userId !== owner) return null;
  const proof = proofs.get(scope);
  return proof && Date.parse(proof.expiresAt) > Date.now() + 5000 ? proof.token : null;
}
export function clearAuthenticator(scope?: AuthenticatorScope) {
  if (scope) proofs.delete(scope); else { proofs.clear(); owner = null; }
}

/** Used only by the authenticated API transport; the server binds proofs to its resolved actor. */
export function activeAuthenticatorProof(scope: AuthenticatorScope): string | null {
  return authenticatorProof(owner, scope);
}
