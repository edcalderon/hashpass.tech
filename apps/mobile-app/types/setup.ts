export type SetupStatus = 'not_started' | 'in_progress' | 'complete';
export type PrivacyScope = 'private' | 'public';
export type SetupGoal = 'hire' | 'get_hired' | 'cofounders' | 'learn' | 'investors' | 'friends';

export interface PinStatus {
  enabled: boolean;
  lockedUntil: string | null;
  remainingAttempts: number | null;
}

export interface UserSetup {
  status: SetupStatus;
  step: number;
  goals: SetupGoal[];
  topics: string[];
  privacyScope: PrivacyScope;
  consentVersion: number | null;
  completedAt: string | null;
  pin: PinStatus;
}

export interface SetupPatch {
  step?: number;
  goals?: SetupGoal[];
  topics?: string[];
  privacyScope?: PrivacyScope;
  consentVersion?: number;
  complete?: boolean;
}

export interface PinOutcome {
  ok: boolean;
  enabled: boolean;
  remainingAttempts: number;
  lockedUntil: string | null;
}

export type SetupApiResult = { success: true; data: UserSetup } | { success: false; error: string };
export type PinApiResult =
  | { success: true; data: PinOutcome & { proof?: { token: string; expiresAt: string } } }
  | { success: false; error: string };
