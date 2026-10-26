export type McpAuthorizationFlow = 'login' | 'consent';

export type McpAuthorizationRequest = {
  isValid: boolean;
  isExpired: boolean;
};

export type McpAuthorizationMachineInput = {
  flow: McpAuthorizationFlow;
  request: McpAuthorizationRequest;
};

export type McpAuthorizationPhase =
  | 'checkingSession'
  | 'signInRequired'
  | 'authorizationRedirect'
  | 'consentVerification'
  | 'consentReady'
  | 'consentSubmitting'
  | 'consentSubmissionError'
  | 'sessionError'
  | 'consentVerificationError'
  | 'invalid'
  | 'expired'
  | 'completed';

export type McpAuthorizationContext = McpAuthorizationMachineInput & {
  error: string | null;
};

export type McpAuthorizationEvent =
  | { type: 'SESSION_AUTHENTICATED' }
  | { type: 'SESSION_ANONYMOUS' }
  | { type: 'SESSION_CHECK_FAILED'; message: string }
  | { type: 'CONSENT_VERIFIED' }
  | { type: 'CONSENT_EXPIRED' }
  | { type: 'CONSENT_VERIFICATION_FAILED'; message: string }
  | { type: 'CONSENT_SUBMIT' }
  | { type: 'CONSENT_COMPLETED' }
  | { type: 'CONSENT_SUBMISSION_FAILED'; message: string }
  | { type: 'RETRY' };

export type McpAuthorizationView = {
  phase: McpAuthorizationPhase;
  canRedirectToAuthorization: boolean;
  canSubmitConsent: boolean;
  canRetry: boolean;
  isBusy: boolean;
  error: string | null;
};
