// The main HASHPASS app (not this hashpass.club site) -- hashpass.club has
// no build-time dev/prod split of its own (single GitHub Pages deploy from
// `main`), so this resolves the *target* app's environment from the
// browser's own origin at call time -- same "trust the real origin" pattern
// as resolveWebOrigin() in packages/auth/src/supabase-oauth.ts -- rather
// than a hardcoded constant. Shared by SignInModal (the connect-flow button)
// and UserMenu (the signed-in "explore dashboard" link).
export function resolveHashpassAppUrl(): string {
  if (typeof window === 'undefined') return 'https://hashpass.tech';
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:8081';
  }
  if (hostname.startsWith('dev.') || hostname.includes('-dev.')) {
    return 'https://dev.hashpass.tech';
  }
  return 'https://hashpass.tech';
}
