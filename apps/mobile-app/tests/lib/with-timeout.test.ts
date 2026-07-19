/// <reference types="jest" />

import { withTimeout } from '../../lib/with-timeout';

describe('withTimeout', () => {
  it('resolves with the value when the promise settles before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 200)).resolves.toBe('ok');
  });

  it('rejects with the original error when the promise rejects before the timeout', async () => {
    await expect(
      withTimeout(Promise.reject(new Error('boom')), 200),
    ).rejects.toThrow('boom');
  });

  it('rejects once the timeout elapses if the promise never settles', async () => {
    // Regression for: signOut() awaited several native/network calls with no
    // timeout of their own (Google Sign-In's native module, Better Auth,
    // Supabase), so a hung call left the caller's "signing out..." UI stuck
    // forever. A promise that simply never resolves or rejects is exactly
    // that failure mode.
    const neverSettles = new Promise(() => {});

    await expect(withTimeout(neverSettles, 20, 'stuckCall')).rejects.toThrow(
      'stuckCall timed out after 20ms',
    );
  });

  it('does not throw when given a non-promise value (defensive against loose mocks)', async () => {
    // A jest.fn() without an explicit resolved value (or, in principle, a
    // provider method with loose typing) returns `undefined`, not a Promise.
    await expect(withTimeout(undefined as unknown as Promise<void>, 200)).resolves.toBeUndefined();
  });
});
