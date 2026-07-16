import { createActor } from 'xstate';

import {
  authSessionMachine,
  getAuthViewState,
  type AuthSessionMachineEvent,
} from '../../hooks/auth-session-machine';

const makeSession = (id: string, provider: string) => ({
  access_token: `${provider}-access-token`,
  provider,
  user: {
    id,
    email: `${id}@example.com`,
    status: 'active',
  },
});

const send = (actor: ReturnType<typeof createActor>, event: AuthSessionMachineEvent) => {
  actor.send(event);
};

describe('authSessionMachine', () => {
  it('keeps an existing Better Auth session authenticated when legacy providers later resolve empty', () => {
    const actor = createActor(authSessionMachine).start();

    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'betterAuth',
      session: makeSession('better-user', 'better-auth'),
    });
    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'directus',
      session: null,
    });
    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'supabase',
      session: null,
    });

    expect(actor.getSnapshot().value).toBe('authenticated');
    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: expect.objectContaining({ id: 'better-user' }),
      isLoggedIn: true,
      isLoading: false,
    });
  });

  it('waits for every provider before resolving an empty bootstrap as logged out', () => {
    const actor = createActor(authSessionMachine).start();

    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'directus',
      session: null,
    });
    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'betterAuth',
      session: null,
    });

    expect(actor.getSnapshot().value).toBe('bootstrapping');
    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: null,
      isLoggedIn: false,
      isLoading: true,
    });

    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'supabase',
      session: null,
    });

    expect(actor.getSnapshot().value).toBe('unauthenticated');
    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: null,
      isLoggedIn: false,
      isLoading: false,
    });
  });

  it('prefers a live Supabase session over a stale Directus session', () => {
    const actor = createActor(authSessionMachine).start();

    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'directus',
      session: makeSession('stale-directus-user', 'directus'),
    });
    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'betterAuth',
      session: null,
    });
    send(actor, {
      type: 'PROVIDER_RESOLVED',
      provider: 'supabase',
      session: makeSession('supabase-user', 'supabase'),
    });

    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: expect.objectContaining({ id: 'supabase-user' }),
      isLoggedIn: true,
      isLoading: false,
    });
  });

  it('lets an explicit authenticated session override provider bootstrap and sign out cleanly', () => {
    const actor = createActor(authSessionMachine).start();

    send(actor, {
      type: 'SESSION_OVERRIDE',
      session: makeSession('override-user', 'supabase'),
    });

    expect(actor.getSnapshot().value).toBe('authenticated');
    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: expect.objectContaining({ id: 'override-user' }),
      isLoggedIn: true,
      isLoading: false,
    });

    send(actor, { type: 'SIGNED_OUT' });

    expect(actor.getSnapshot().value).toBe('unauthenticated');
    expect(getAuthViewState(actor.getSnapshot())).toEqual({
      user: null,
      isLoggedIn: false,
      isLoading: false,
    });
  });
});
