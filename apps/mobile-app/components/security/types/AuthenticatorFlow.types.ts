export type AuthenticatorFlowPhase =
  | 'checking'
  | 'optional'
  | 'pinRequired'
  | 'enroll'
  | 'verify'
  | 'backup'
  | 'statusUnavailable';
