/// <reference types="jest" />

// Regression coverage for: SupabaseAuthProvider.signOut() clearing the
// persisted local session unconditionally, instead of only after the network
// sign-out call resolves. @supabase/auth-js's GoTrueClient._signOut() awaits
// the server-side token revocation BEFORE it clears its own local storage —
// on this app's documented flaky native transport, that network call can
// hang indefinitely, which previously meant the persisted session survived on
// disk (and a later getSession() would resurrect a user who had just tapped
// Logout), even though the caller's own withTimeout() wrapper had already
// given up waiting.

describe('SupabaseAuthProvider.signOut', () => {
  const buildMockGoTrueAuth = ({ hangSignOut }: { hangSignOut: boolean }) => {
    const removeItem = jest.fn(async () => undefined);
    const storage = { removeItem };
    const storageKey = 'sb-test-project-auth-token';

    const signOut = hangSignOut
      ? jest.fn(() => new Promise(() => {})) // never settles, mirrors a hung native transport
      : jest.fn(async () => ({ error: null }));

    return {
      auth: {
        storage,
        storageKey,
        signOut,
        getSession: jest.fn(async () => ({ data: { session: null } })),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
      },
      removeItem,
      storageKey,
      signOut,
    };
  };

  it('clears the persisted session storage even when the network sign-out call never settles', async () => {
    const { auth, removeItem, storageKey } = buildMockGoTrueAuth({ hangSignOut: true });

    const { SupabaseAuthProvider } = require('../../../../packages/auth/src/providers/supabase');
    const provider = new SupabaseAuthProvider('https://example.supabase.co', 'anon-key', {
      auth,
    } as any);

    // Don't await — the mocked network signOut() never resolves, so an await
    // here would hang the test the same way a real hung request would hang
    // the app. The storage clear must already have happened synchronously
    // before signOut()'s first await on the network call.
    void provider.signOut();
    await Promise.resolve();
    await Promise.resolve();

    expect(removeItem).toHaveBeenCalledWith(storageKey);
  });

  it('clears the persisted session storage before awaiting a successful network sign-out too', async () => {
    const { auth, removeItem, storageKey, signOut } = buildMockGoTrueAuth({ hangSignOut: false });

    const { SupabaseAuthProvider } = require('../../../../packages/auth/src/providers/supabase');
    const provider = new SupabaseAuthProvider('https://example.supabase.co', 'anon-key', {
      auth,
    } as any);

    const removeItemCallOrder: number[] = [];
    const signOutCallOrder: number[] = [];
    let callCounter = 0;
    removeItem.mockImplementation(async () => {
      removeItemCallOrder.push(++callCounter);
    });
    signOut.mockImplementation(async () => {
      signOutCallOrder.push(++callCounter);
      return { error: null };
    });

    const result = await provider.signOut();

    expect(result).toEqual({});
    expect(removeItem).toHaveBeenCalledWith(storageKey);
    expect(Math.min(...removeItemCallOrder)).toBeLessThan(Math.min(...signOutCallOrder));
  });
});
