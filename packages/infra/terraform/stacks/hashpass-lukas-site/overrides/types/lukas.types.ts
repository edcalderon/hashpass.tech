import type { ReactNode } from 'react';

export type LukasAnimationLevel = 'full' | 'reduced' | 'none';

export type LukasGlyphName =
  | 'coffee'
  | 'event'
  | 'market'
  | 'network'
  | 'reserve'
  | 'shield'
  | 'settings'
  | 'token'
  | 'wallet';

export type LukasGlyphProps = {
  name: LukasGlyphName;
  size?: number;
  /** Overrides the page-level motion setting for this glyph. */
  animationLevel?: LukasAnimationLevel;
};

export type LukasCoinProps = {
  size?: number;
  animationLevel?: LukasAnimationLevel;
};

export type LukasWhyVideoProps = {
  locale: string;
  animationLevel: LukasAnimationLevel;
  isDark: boolean;
  onReward?: () => void;
};

export type HeroSectionProps = {
  onGetLukas: () => void;
  getLukasDisabled?: boolean;
  onForMerchants: () => void;
  rewardTotal: number;
  rewardMax?: number;
  rewardDelta: number;
  rewardClaimed?: boolean;
  animationLevel: LukasAnimationLevel;
};

export type LukasCaptchaProps = {
  onSolve: (token: string) => void;
  onReset?: () => void;
  resetKey?: number;
};

export type LukasCapSolveResult = { success: boolean; token: string };
export type LukasCapInstance = {
  solve: () => Promise<LukasCapSolveResult>;
  widget: { remove: () => void };
};
export type LukasCapConstructor = new (config: { apiEndpoint: string }) => LukasCapInstance;
export type LukasCapWindow = Window & { Cap?: LukasCapConstructor };

export type LukasSettingsMenuProps = {
  animation: LukasAnimationLevel;
  onAnimationChange: (level: LukasAnimationLevel) => void;
};

export type LukasClaimModalProps = {
  visible: boolean;
  onClose: () => void;
  rewardTotal?: number;
  onClaimed?: (email: string) => void;
};
export type LukasClaimStep = 'quiz' | 'email' | 'code' | 'verified';
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
  completed: Partial<Record<LukasRewardId, true>>;
  claimed: boolean;
  claimedEmail: string | null;
  lastRewardId: LukasRewardId | null;
  lastAwarded: number;
};

export type LukasRewardId =
  | 'hero'
  | 'video'
  | 'how-collateral'
  | 'how-mint'
  | 'how-merchant'
  | 'merchant'
  | 'wallet'
  | 'join';

export type LukasRewardDefinition = {
  id: LukasRewardId;
  amount: number;
};

export type LukasRewardResult = {
  state: LukasRewardState;
  awarded: number;
  reachedCap: boolean;
};

export type LukasRewardsContextValue = {
  state: LukasRewardState;
  total: number;
  max: number;
  rewardDelta: number;
  hydrated: boolean;
  earn: (id: LukasRewardId) => LukasRewardResult | null;
  markClaimed: (email: string) => void;
};

export type LukasRewardWalletProps = { onOpenClaim: () => void };

export type LukasClickResult = {
  state: LukasRewardState;
  awarded: number;
  reachedCap: boolean;
  rapid: boolean;
};

export type LukasPalette = {
  fill: string; onFill: string; accent: string; text: string; body: string; muted: string;
  card: string; cardRaised: string; border: string; borderStrong: string; tint: string;
  danger: string; glow: string; canvas: string;
};

export type LukasDialogProps = { visible: boolean; onClose: () => void; isDark: boolean; isMobile: boolean; palette: LukasPalette; closeLabel?: string; children: ReactNode };
