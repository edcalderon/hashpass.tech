// Lightweight in-process circuit breaker for Supabase/Postgres calls.
//
// Scope, deliberately: this is a per-warm-Lambda-container guard (module-level
// state resets on cold start), not a distributed circuit breaker. It exists to
// stop a single unhealthy backend from being hammered by repeated retries from
// the SAME container during an incident -- e.g. resolveNotificationIdentity's
// self-heal path retrying an UPSERT on every request while the DB is already
// failing (root cause of a real incident: ~25k Realtime WAL-polling calls +
// ~14.5k redundant identity-registry lookups against a struggling dev project,
// confirmed via pg_stat_statements, 2026-08-14). It is not a substitute for
// real infrastructure monitoring.
//
// Keyed per Supabase profile id (core-development, bsl-production, etc.) since
// each is an independent backend with independent health.

import { sendOpsAlertEmail } from '../email';

type GuardState = 'closed' | 'open';

interface ProfileGuardState {
  state: GuardState;
  consecutiveFailures: number;
  windowStartedAt: number;
  openedAt: number | null;
  lastAlertSentAt: number | null;
}

// Trip after this many consecutive failures observed within FAILURE_WINDOW_MS.
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_MS = 30_000;
// Once open, stay open (skip expensive/non-critical work) for this long
// before allowing a trial request through again.
const COOLDOWN_MS = 60_000;
// Don't re-send the same alert more often than this, even across multiple
// trip events, so a flapping backend doesn't spam support@hashpass.tech.
const MIN_ALERT_INTERVAL_MS = 15 * 60_000;

const guards = new Map<string, ProfileGuardState>();

const getGuard = (profileId: string): ProfileGuardState => {
  let guard = guards.get(profileId);
  if (!guard) {
    guard = { state: 'closed', consecutiveFailures: 0, windowStartedAt: Date.now(), openedAt: null, lastAlertSentAt: null };
    guards.set(profileId, guard);
  }
  return guard;
};

export interface RecordFailureOptions {
  profileId: string;
  environment: 'development' | 'production';
  context: string;
  error?: unknown;
}

/**
 * Record a failed Supabase/Postgres call. Trips the breaker (and, in
 * production only, fires an alert email) once FAILURE_THRESHOLD consecutive
 * failures land within FAILURE_WINDOW_MS.
 */
export const recordDbFailure = (options: RecordFailureOptions): void => {
  const guard = getGuard(options.profileId);
  const now = Date.now();

  if (now - guard.windowStartedAt > FAILURE_WINDOW_MS) {
    guard.consecutiveFailures = 0;
    guard.windowStartedAt = now;
  }
  guard.consecutiveFailures += 1;

  if (guard.state === 'closed' && guard.consecutiveFailures >= FAILURE_THRESHOLD) {
    guard.state = 'open';
    guard.openedAt = now;

    const canAlert =
      options.environment === 'production' &&
      (!guard.lastAlertSentAt || now - guard.lastAlertSentAt > MIN_ALERT_INTERVAL_MS);

    if (canAlert) {
      guard.lastAlertSentAt = now;
      const errorMessage = options.error instanceof Error ? options.error.message : String(options.error ?? '');
      // Fire-and-forget: never let alerting itself block or fail the request
      // that triggered it.
      sendOpsAlertEmail({
        subject: `[HASHPASS] Database backend unhealthy: ${options.profileId}`,
        message:
          `${guard.consecutiveFailures} consecutive failures calling Supabase ` +
          `(profile: ${options.profileId}, last failing call: ${options.context}) within the last ${Math.round(FAILURE_WINDOW_MS / 1000)}s.\n\n` +
          `Last error: ${errorMessage || '(no error message captured)'}\n\n` +
          `This is an automated alert from the in-process db-health-guard circuit breaker. It only fires for production profiles, at most once every ${Math.round(MIN_ALERT_INTERVAL_MS / 60000)} minutes per backend.`,
      }).catch((emailError) => {
        console.error('[db-health-guard] failed to send ops alert email:', emailError);
      });
    }

    console.error(
      `[db-health-guard] ${options.profileId} tripped open after ${guard.consecutiveFailures} consecutive failures (last: ${options.context})`
    );
  }
};

/** Record a successful Supabase/Postgres call, closing the breaker if open. */
export const recordDbSuccess = (profileId: string): void => {
  const guard = getGuard(profileId);
  guard.consecutiveFailures = 0;
  if (guard.state === 'open') {
    guard.state = 'closed';
    guard.openedAt = null;
    console.log(`[db-health-guard] ${profileId} recovered, breaker closed`);
  }
};

/**
 * Whether callers should skip non-critical/expensive work (retries,
 * self-healing writes, new Realtime subscriptions) against this backend
 * right now. Allows one trial request through per COOLDOWN_MS so the breaker
 * can detect recovery instead of staying open forever.
 */
export const shouldBackOff = (profileId: string): boolean => {
  const guard = getGuard(profileId);
  if (guard.state !== 'open') return false;
  if (guard.openedAt && Date.now() - guard.openedAt > COOLDOWN_MS) {
    // Allow a trial request through; recordDbSuccess/recordDbFailure above
    // will close or re-open the breaker based on how it goes.
    guard.openedAt = Date.now();
    return false;
  }
  return true;
};

export const getGuardState = (profileId: string): GuardState => getGuard(profileId).state;
