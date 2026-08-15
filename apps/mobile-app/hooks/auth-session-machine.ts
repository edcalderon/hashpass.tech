import type { AuthSession, AuthUser } from '@hashpass/auth';
import { assign, createActor, createMachine, type SnapshotFrom } from 'xstate';

export type AuthSessionProvider = 'directus' | 'betterAuth' | 'supabase';

type ProviderSessionState = {
  ready: boolean;
  loggedIn: boolean;
  user: AuthUser | null;
  session: AuthSession | null;
};

type AuthSessionMachineContext = {
  sessionOverride: AuthSession | null;
  providers: Record<AuthSessionProvider, ProviderSessionState>;
  // Set to a future timestamp by SIGNED_OUT, cleared by a real
  // SESSION_OVERRIDE. While "now" is before this, a PROVIDER_RESOLVED
  // reporting loggedIn:true is dropped instead of applied -- see
  // SIGN_OUT_RESURRECTION_BARRIER_MS below for why this window exists.
  signOutBarrierUntil: number | null;
};

export type AuthSessionMachineEvent =
  | {
      type: 'PROVIDER_RESOLVED';
      provider: AuthSessionProvider;
      session?: AuthSession | null;
      user?: AuthUser | null;
      loggedIn?: boolean;
    }
  | {
      type: 'SESSION_OVERRIDE';
      session: AuthSession;
    }
  | {
      type: 'CLEAR_SESSION_OVERRIDE';
    }
  | {
      type: 'SIGNED_OUT';
    };

const PROVIDER_PRIORITY: AuthSessionProvider[] = ['betterAuth', 'supabase', 'directus'];
export const AUTH_SESSION_SETTLE_DELAY_MS = 350;
// signOut() in hooks/useAuth.ts emits SIGNED_OUT synchronously but then runs
// remote provider sign-outs (Better Auth, native Google, Supabase) as
// detached, individually-timed-out (SIGN_OUT_STEP_TIMEOUT_MS, 8s each)
// background work when called with waitForRemoteCleanup:false -- the whole
// point being that the caller doesn't wait on them before navigating away.
// Those detached calls, plus a fresh useAuth() mount re-subscribing to
// provider onAuthStateChange while GoTrue's in-memory session hasn't been
// revoked yet, can both emit a PROVIDER_RESOLVED with loggedIn:true for up
// to that ~8s window even though the user just explicitly signed out --
// resurrecting the dashboard with the stale pre-logout user until the next
// cold start clears every in-memory cache. This barrier is intentionally a
// little longer than the single-step timeout to also cover the sequential
// native Google cleanup step ahead of the parallel batch.
export const SIGN_OUT_RESURRECTION_BARRIER_MS = 10_000;

const emptyProviderState = (): ProviderSessionState => ({
  ready: false,
  loggedIn: false,
  user: null,
  session: null,
});

const loggedOutProviderState = (): ProviderSessionState => ({
  ...emptyProviderState(),
  ready: true,
});

const createInitialContext = (): AuthSessionMachineContext => ({
  sessionOverride: null,
  providers: {
    directus: emptyProviderState(),
    betterAuth: emptyProviderState(),
    supabase: emptyProviderState(),
  },
  signOutBarrierUntil: null,
});

const toProviderSessionState = (
  event: Extract<AuthSessionMachineEvent, { type: 'PROVIDER_RESOLVED' }>
): ProviderSessionState => {
  const session = event.session ?? null;
  const user = session?.user ?? event.user ?? null;
  const loggedIn = event.loggedIn ?? Boolean(user);

  return {
    ready: true,
    loggedIn: loggedIn && Boolean(user),
    user: loggedIn ? user : null,
    session: loggedIn ? session : null,
  };
};

// Provider clients can report their current session every time a hook mounts.
// An unchanged identity and credential set is not a state transition. Letting
// it through recreates the providers object, which makes XState publish a
// snapshot and can remount navigator headers that also consume useAuth().
const providerStateChanged = (
  current: ProviderSessionState,
  next: ProviderSessionState,
): boolean =>
  current.ready !== next.ready ||
  current.loggedIn !== next.loggedIn ||
  current.user?.id !== next.user?.id ||
  current.user?.email !== next.user?.email ||
  current.user?.role !== next.user?.role ||
  current.user?.status !== next.user?.status ||
  current.session?.access_token !== next.session?.access_token ||
  current.session?.refresh_token !== next.session?.refresh_token ||
  current.session?.expires_at !== next.session?.expires_at ||
  current.session?.provider !== next.session?.provider;

const allProvidersReady = (context: AuthSessionMachineContext): boolean =>
  Object.values(context.providers).every((provider) => provider.ready);

const resolveProviderUser = (provider: ProviderSessionState): AuthUser | null =>
  provider.loggedIn ? provider.user : null;

const resolveAuthenticatedUser = (context: AuthSessionMachineContext): AuthUser | null => {
  if (context.sessionOverride?.user) {
    return context.sessionOverride.user;
  }

  for (const provider of PROVIDER_PRIORITY) {
    const user = resolveProviderUser(context.providers[provider]);
    if (user) {
      return user;
    }
  }

  return null;
};

const hasAuthenticatedUser = (context: AuthSessionMachineContext): boolean =>
  Boolean(resolveAuthenticatedUser(context));

export const authSessionMachine = createMachine(
  {
    id: 'authSession',
    types: {} as {
      context: AuthSessionMachineContext;
      events: AuthSessionMachineEvent;
    },
    context: createInitialContext,
    initial: 'bootstrapping',
    states: {
      bootstrapping: {
        always: [
          {
            guard: 'hasAuthenticatedUser',
            target: 'settlingAuthenticated',
          },
          {
            guard: 'allProvidersReady',
            target: 'unauthenticated',
          },
        ],
        on: {
          PROVIDER_RESOLVED: [
            { guard: 'providerResolutionBarred' },
            { guard: 'providerResolutionChanged', actions: 'setProviderResolved' },
          ],
          SESSION_OVERRIDE: {
            actions: 'setSessionOverride',
          },
          CLEAR_SESSION_OVERRIDE: {
            actions: 'clearSessionOverride',
          },
          SIGNED_OUT: {
            actions: 'clearAuthState',
            target: 'unauthenticated',
          },
        },
      },
      authenticated: {
        always: [
          {
            guard: 'hasNoAuthenticatedUserAndAllProvidersReady',
            target: 'unauthenticated',
          },
          {
            guard: 'hasNoAuthenticatedUser',
            target: 'bootstrapping',
          },
        ],
        on: {
          PROVIDER_RESOLVED: [
            { guard: 'providerResolutionBarred' },
            { guard: 'providerResolutionChanged', actions: 'setProviderResolved' },
          ],
          SESSION_OVERRIDE: {
            actions: 'setSessionOverride',
          },
          CLEAR_SESSION_OVERRIDE: {
            actions: 'clearSessionOverride',
          },
          SIGNED_OUT: {
            actions: 'clearAuthState',
            target: 'unauthenticated',
          },
        },
      },
      settlingAuthenticated: {
        always: [
          {
            guard: 'hasNoAuthenticatedUserAndAllProvidersReady',
            target: 'unauthenticated',
          },
          {
            guard: 'hasNoAuthenticatedUser',
            target: 'bootstrapping',
          },
        ],
        after: {
          [AUTH_SESSION_SETTLE_DELAY_MS]: {
            guard: 'hasAuthenticatedUser',
            target: 'authenticated',
          },
        },
        on: {
          PROVIDER_RESOLVED: [
            { guard: 'providerResolutionBarred' },
            { guard: 'providerResolutionChanged', actions: 'setProviderResolved' },
          ],
          SESSION_OVERRIDE: {
            actions: 'setSessionOverride',
          },
          CLEAR_SESSION_OVERRIDE: {
            actions: 'clearSessionOverride',
          },
          SIGNED_OUT: {
            actions: 'clearAuthState',
            target: 'unauthenticated',
          },
        },
      },
      unauthenticated: {
        always: [
          {
            guard: 'hasAuthenticatedUser',
            target: 'settlingAuthenticated',
          },
          {
            guard: 'notAllProvidersReady',
            target: 'bootstrapping',
          },
        ],
        on: {
          PROVIDER_RESOLVED: [
            { guard: 'providerResolutionBarred' },
            { guard: 'providerResolutionChanged', actions: 'setProviderResolved' },
          ],
          SESSION_OVERRIDE: {
            actions: 'setSessionOverride',
          },
          CLEAR_SESSION_OVERRIDE: {
            actions: 'clearSessionOverride',
          },
          SIGNED_OUT: {
            actions: 'clearAuthState',
          },
        },
      },
    },
  },
  {
    actions: {
      setProviderResolved: assign(({ context, event }) => {
        if (event.type !== 'PROVIDER_RESOLVED') {
          return {};
        }

        return {
          providers: {
            ...context.providers,
            [event.provider]: toProviderSessionState(event),
          },
        };
      }),
      setSessionOverride: assign(({ event }) => {
        if (event.type !== 'SESSION_OVERRIDE') {
          return {};
        }

        return {
          // A real, explicit new session (magic link/OTP verify, etc.)
          // always wins over a stale sign-out barrier -- this is exactly
          // the "genuine new sign-in" case the barrier isn't meant to
          // block, so clear it here rather than making the user wait out
          // the rest of the window.
          sessionOverride: event.session,
          signOutBarrierUntil: null,
        };
      }),
      clearSessionOverride: assign({
        sessionOverride: null,
      }),
      clearAuthState: assign(() => ({
        sessionOverride: null,
        providers: {
          directus: loggedOutProviderState(),
          betterAuth: loggedOutProviderState(),
          supabase: loggedOutProviderState(),
        },
        signOutBarrierUntil: Date.now() + SIGN_OUT_RESURRECTION_BARRIER_MS,
      })),
    },
    guards: {
      hasAuthenticatedUser: ({ context }) => hasAuthenticatedUser(context),
      hasNoAuthenticatedUser: ({ context }) => !hasAuthenticatedUser(context),
      allProvidersReady: ({ context }) => allProvidersReady(context),
      notAllProvidersReady: ({ context }) => !allProvidersReady(context),
      hasNoAuthenticatedUserAndAllProvidersReady: ({ context }) =>
        !hasAuthenticatedUser(context) && allProvidersReady(context),
      providerResolutionChanged: ({ context, event }) => {
        if (event.type !== 'PROVIDER_RESOLVED') {
          return false;
        }

        return providerStateChanged(
          context.providers[event.provider],
          toProviderSessionState(event),
        );
      },
      // Drops a loggedIn:true resolution arriving inside the post-sign-out
      // barrier window -- see SIGN_OUT_RESURRECTION_BARRIER_MS. A
      // loggedIn:false resolution during the same window is NOT barred (it
      // falls through to providerResolutionChanged normally): confirming
      // "this provider is now signed out" is exactly what should keep
      // flowing through during the window.
      providerResolutionBarred: ({ context, event }) => {
        if (event.type !== 'PROVIDER_RESOLVED') {
          return false;
        }
        if (context.signOutBarrierUntil === null || Date.now() >= context.signOutBarrierUntil) {
          return false;
        }
        return toProviderSessionState(event).loggedIn;
      },
    },
  }
);

export type AuthSessionMachineSnapshot = SnapshotFrom<typeof authSessionMachine>;

export const createAuthSessionActor = () => createActor(authSessionMachine);

export const getAuthViewState = (snapshot: AuthSessionMachineSnapshot) => {
  const user = resolveAuthenticatedUser(snapshot.context);
  const isSettlingAuthenticated = snapshot.matches('settlingAuthenticated');

  return {
    user,
    isLoggedIn: Boolean(user),
    isLoading: isSettlingAuthenticated || (!user && !allProvidersReady(snapshot.context)),
  };
};
