import type { LukasClickResult, LukasRewardState } from '../../types/lukas.types';

export const LUKAS_REWARD_CAP = 10;
const RAPID_CLICK_WINDOW_MS = 650;
const STREAK_WINDOW_MS = 1_500;

export function createInitialLukasRewardState(): LukasRewardState {
  return { total: 0, clickCount: 0, lastClickAt: null, streak: 0 };
}

/** Plays a tiny user-gesture sound without shipping an audio asset or loading
 * third-party media. It is intentionally best-effort because browsers may
 * still reject an AudioContext after a user changes autoplay preferences. */
export function playLukasClickSound(awarded: number): void {
  if (typeof window === 'undefined' || awarded <= 0) return;

  try {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextConstructor = window.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return;

    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(620 + Math.min(awarded, 3) * 90, now);
    oscillator.frequency.exponentialRampToValueAtTime(980, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { void context.close(); };
    oscillator.start(now);
    oscillator.stop(now + 0.16);
  } catch {
    // Audio is a decorative enhancement; the reward interaction still works.
  }
}

/**
 * Computes the local landing-game feedback. The cap is deliberately local and
 * bounded: it is an interaction reward, not a wallet balance or a claim.
 */
export function applyLukasClick(
  state: LukasRewardState,
  now: number,
  random: () => number = Math.random,
): LukasClickResult {
  if (state.total >= LUKAS_REWARD_CAP) {
    return { state, awarded: 0, reachedCap: true, rapid: false };
  }

  const elapsed = state.lastClickAt === null ? Number.POSITIVE_INFINITY : Math.max(0, now - state.lastClickAt);
  const rapid = elapsed <= RAPID_CLICK_WINDOW_MS;
  const inStreak = elapsed <= STREAK_WINDOW_MS;
  const streak = inStreak ? state.streak + 1 : 0;
  const cadenceBonus = rapid && random() >= 0.8 ? 1 : 0;
  const requested = 1 + (rapid ? 1 : 0) + cadenceBonus;
  const awarded = Math.min(requested, LUKAS_REWARD_CAP - state.total);
  const nextTotal = state.total + awarded;
  const nextState: LukasRewardState = {
    total: nextTotal,
    clickCount: state.clickCount + 1,
    lastClickAt: now,
    streak,
  };

  return {
    state: nextState,
    awarded,
    reachedCap: nextTotal >= LUKAS_REWARD_CAP,
    rapid,
  };
}
