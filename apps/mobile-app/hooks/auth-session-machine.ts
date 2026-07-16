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
          PROVIDER_RESOLVED: {
            actions: 'setProviderResolved',
          },
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
          PROVIDER_RESOLVED: {
            actions: 'setProviderResolved',
          },
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
          PROVIDER_RESOLVED: {
            actions: 'setProviderResolved',
          },
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
          PROVIDER_RESOLVED: {
            actions: 'setProviderResolved',
          },
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
          sessionOverride: event.session,
        };
      }),
      clearSessionOverride: assign({
        sessionOverride: null,
      }),
      clearAuthState: assign({
        sessionOverride: null,
        providers: {
          directus: loggedOutProviderState(),
          betterAuth: loggedOutProviderState(),
          supabase: loggedOutProviderState(),
        },
      }),
    },
    guards: {
      hasAuthenticatedUser: ({ context }) => hasAuthenticatedUser(context),
      hasNoAuthenticatedUser: ({ context }) => !hasAuthenticatedUser(context),
      allProvidersReady: ({ context }) => allProvidersReady(context),
      notAllProvidersReady: ({ context }) => !allProvidersReady(context),
      hasNoAuthenticatedUserAndAllProvidersReady: ({ context }) =>
        !hasAuthenticatedUser(context) && allProvidersReady(context),
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
