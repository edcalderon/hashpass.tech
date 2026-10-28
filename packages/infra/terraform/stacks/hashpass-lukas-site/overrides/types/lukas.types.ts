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
};

export type HeroSectionProps = {
  onGetLukas: () => void;
  onForMerchants: () => void;
  rewardTotal: number;
  rewardDelta: number;
  animationLevel: LukasAnimationLevel;
};

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

export type LukasPalette = {
  fill: string; onFill: string; accent: string; text: string; body: string; muted: string;
  card: string; cardRaised: string; border: string; borderStrong: string; tint: string;
  danger: string; glow: string; canvas: string;
};

export type LukasDialogProps = { visible: boolean; onClose: () => void; isDark: boolean; isMobile: boolean; palette: LukasPalette; closeLabel?: string; children: ReactNode };

export type LukasGlyphTone = { a: string; b: string; glow: string; delay: string };
