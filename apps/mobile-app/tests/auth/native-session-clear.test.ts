/// <reference types="jest" />

import { clearNativeProviderSessionKeys } from '../../lib/auth/native-session-clear';

describe('clearNativeProviderSessionKeys', () => {
  it('removes Better Auth and Directus caches before navigation can restore a session', async () => {
    const deleteItemAsync = jest.fn<Promise<void>, [string]>(async () => undefined);

    await clearNativeProviderSessionKeys(deleteItemAsync);

    expect(deleteItemAsync).toHaveBeenCalledWith('hashpass_better_auth_session');
    expect(deleteItemAsync).toHaveBeenCalledWith('hashpass_directus_session');
  });
});
