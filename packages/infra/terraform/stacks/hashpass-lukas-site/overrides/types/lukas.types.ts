export type LukasAnimationLevel = 'full' | 'reduced' | 'none';

export type LukasCaptchaProps = {
  onSolve: (token: string) => void;
  onReset?: () => void;
  resetKey?: number;
};

export type LukasSettingsMenuProps = {
  animation: LukasAnimationLevel;
  onAnimationChange: (level: LukasAnimationLevel) => void;
};

export type LukasClaimModalProps = { visible: boolean; onClose: () => void };
export type LukasClaimStep = 'email' | 'code' | 'verified';
export type LukasClaimSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
};

export type LukasRewardState = {
  total: number;
  clickCount: number;
  lastClickAt: number | null;
  streak: number;
};

export type LukasClickResult = {
  state: LukasRewardState;
  awarded: number;
  reachedCap: boolean;
  rapid: boolean;
};
