export type AuthenticatorScope = 'access' | 'critical';
export interface AuthenticatorProof { token: string; expiresAt: string }
export interface AuthenticatorStatus { enabled: boolean }
export interface AuthenticatorEnrollment { secret: string; uri: string }
export interface AuthenticatorResult { proof: AuthenticatorProof; recoveryCodes?: string[] }
export type AuthenticatorCompletion = 'authenticator' | 'pin';
export interface AuthenticatorFlowProps {
  scope: AuthenticatorScope;
  onDone: (completion: AuthenticatorCompletion) => void;
  pinProof?: string | null;
}

export type WalletSection = 'contacts' | 'assets' | 'rewards' | 'passes';
