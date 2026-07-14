/**
 * Dev-only auth-guard bypass for local debugging of screens behind the
 * dashboard's login requirement (e.g. reproducing native rendering issues
 * without needing a working OTP/magic-link session).
 *
 * Double-gated so it can never affect a real build:
 * - `__DEV__` is false in every release/production bundle regardless of any
 *   env var, so this is structurally inert outside a dev build.
 * - `EXPO_PUBLIC_DEV_AUTH_BYPASS` must be explicitly set to `'true'` in a
 *   gitignored `.env.local` — unset/absent by default, never committed.
 */
export const isDevAuthBypassEnabled = (): boolean =>
  __DEV__ && process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS === 'true';
