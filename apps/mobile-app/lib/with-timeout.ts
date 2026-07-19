/**
 * Race a promise against a timeout, rejecting if it doesn't settle in time.
 *
 * Several native/network calls this app depends on (Google Sign-In's native
 * module, Better Auth's client, Supabase's client) have no timeout of their
 * own, and this app's own history has repeatedly hit real native network
 * flakiness on these exact paths (see the v1.8.234-239 auth crash
 * investigation). A promise that never settles — not even with an error —
 * means `await` never returns, which silently hangs whatever UI is waiting
 * on it (e.g. a logout button's busy state) forever. This does not cancel
 * the underlying operation, only stops the caller from waiting on it.
 */
export const withTimeout = <T>(promise: Promise<T>, ms: number, label?: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label ? `${label} timed out after ${ms}ms` : `Timed out after ${ms}ms`));
    }, ms);

    // Promise.resolve(...) instead of calling `promise.then` directly: some
    // callers pass through loosely-typed provider methods (and test mocks)
    // that don't always return a genuine thenable, and a plain value or
    // undefined would otherwise throw "Cannot read properties of undefined
    // (reading 'then')" here instead of just resolving with that value.
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
