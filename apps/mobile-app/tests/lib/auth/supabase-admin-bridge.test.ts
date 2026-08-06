/// <reference types="jest" />

import {
  normalizeEmail,
  isDuplicateSupabaseUserError,
  findSupabaseUserByEmail,
  issueSupabaseSessionBridge,
  createSupabaseBridgeSession,
  ensureSupabaseAccountForEmail,
} from '../../../lib/auth/supabase-admin-bridge';

describe('supabase-admin-bridge', () => {
  describe('normalizeEmail', () => {
    it('trims and lowercases', () => {
      expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
    });

    it('returns empty string for null/undefined', () => {
      expect(normalizeEmail(null)).toBe('');
      expect(normalizeEmail(undefined)).toBe('');
    });
  });

  describe('isDuplicateSupabaseUserError', () => {
    it('matches known duplicate-user error phrasings', () => {
      expect(isDuplicateSupabaseUserError('User already registered')).toBe(true);
      expect(
        isDuplicateSupabaseUserError(
          'A user with this email address has already been registered'
        )
      ).toBe(true);
      expect(isDuplicateSupabaseUserError('A user with this email already exists')).toBe(true);
      expect(isDuplicateSupabaseUserError('duplicate key value violates unique constraint')).toBe(true);
    });

    it('does not match unrelated errors', () => {
      expect(isDuplicateSupabaseUserError('Invalid email format')).toBe(false);
    });
  });

  describe('findSupabaseUserByEmail', () => {
    it('returns the matching user across pages', () => {
      const fullPage = Array.from({ length: 200 }, (_, i) => ({ email: `user${i}@example.com` }));
      const listUsers = jest
        .fn()
        .mockResolvedValueOnce({ data: { users: fullPage }, error: null })
        .mockResolvedValueOnce({ data: { users: [{ email: 'target@example.com' }] }, error: null });
      const client = { auth: { admin: { listUsers } } } as any;

      return findSupabaseUserByEmail(client, 'Target@Example.com').then((user: any) => {
        expect(user).toEqual({ email: 'target@example.com' });
        expect(listUsers).toHaveBeenCalledTimes(2);
      });
    });

    it('returns null when listUsers errors', async () => {
      const client = {
        auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: null, error: { message: 'failed' } }) } },
      } as any;

      const user = await findSupabaseUserByEmail(client, 'user@example.com');
      expect(user).toBeNull();
    });

    it('returns null when no match is found and pagination ends', async () => {
      const client = {
        auth: { admin: { listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }) } },
      } as any;

      const user = await findSupabaseUserByEmail(client, 'nobody@example.com');
      expect(user).toBeNull();
    });
  });

  describe('issueSupabaseSessionBridge', () => {
    it('extracts token_hash from properties directly', async () => {
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hash-abc', verification_type: 'magiclink' } },
              error: null,
            }),
          },
        },
      } as any;

      const bridge = await issueSupabaseSessionBridge(client, 'User@Example.com');
      expect(bridge).toEqual({ token_hash: 'hash-abc', type: 'magiclink', email: 'user@example.com' });
    });

    it('falls back to extracting token_hash from the action_link URL', async () => {
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({
              data: { properties: { action_link: 'https://x.supabase.co/verify?token_hash=hash-from-url&type=magiclink' } },
              error: null,
            }),
          },
        },
      } as any;

      const bridge = await issueSupabaseSessionBridge(client, 'user@example.com');
      expect(bridge?.token_hash).toBe('hash-from-url');
    });

    it('returns null when generateLink errors', async () => {
      const client = {
        auth: { admin: { generateLink: jest.fn().mockResolvedValue({ data: null, error: { message: 'failed' } }) } },
      } as any;

      const bridge = await issueSupabaseSessionBridge(client, 'user@example.com');
      expect(bridge).toBeNull();
    });

    it('returns null for an empty email', async () => {
      const client = { auth: { admin: { generateLink: jest.fn() } } } as any;
      const bridge = await issueSupabaseSessionBridge(client, '');
      expect(bridge).toBeNull();
      expect(client.auth.admin.generateLink).not.toHaveBeenCalled();
    });

    it('returns null when no token_hash can be extracted', async () => {
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({ data: { properties: {} }, error: null }),
          },
        },
      } as any;

      const bridge = await issueSupabaseSessionBridge(client, 'user@example.com');
      expect(bridge).toBeNull();
    });

    it('returns null and logs when generateLink throws unexpectedly', async () => {
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockRejectedValue(new Error('network down')),
          },
        },
      } as any;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const bridge = await issueSupabaseSessionBridge(client, 'user@example.com');

      expect(bridge).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Supabase Bridge] Failed to issue session bridge link:',
        'network down'
      );
      warnSpy.mockRestore();
    });
  });

  describe('createSupabaseBridgeSession', () => {
    it('does not verify when a one-time link cannot be issued', async () => {
      const verifyOtp = jest.fn();
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({ data: null, error: { message: 'link failed' } }),
          },
          verifyOtp,
        },
      } as any;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(createSupabaseBridgeSession(client, 'user@example.com')).resolves.toBeNull();
      expect(verifyOtp).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('consumes the one-time token server-side and returns only session tokens', async () => {
      const verifyOtp = jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'access-123',
            refresh_token: 'refresh-123',
          },
        },
        error: null,
      });
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hash-abc', verification_type: 'magiclink' } },
              error: null,
            }),
          },
          verifyOtp,
        },
      } as any;

      await expect(createSupabaseBridgeSession(client, 'User@Example.com')).resolves.toEqual({
        access_token: 'access-123',
        refresh_token: 'refresh-123',
      });
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-abc', type: 'magiclink' });
    });

    it('does not return a bridge session when server-side verification fails', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hash-abc', verification_type: 'magiclink' } },
              error: null,
            }),
          },
          verifyOtp: jest.fn().mockResolvedValue({ data: { session: null }, error: { message: 'expired' } }),
        },
      } as any;

      await expect(createSupabaseBridgeSession(client, 'user@example.com')).resolves.toBeNull();
      warnSpy.mockRestore();
    });

    it('does not expose a session when server-side verification throws', async () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const client = {
        auth: {
          admin: {
            generateLink: jest.fn().mockResolvedValue({
              data: { properties: { hashed_token: 'hash-abc', verification_type: 'magiclink' } },
              error: null,
            }),
          },
          verifyOtp: jest.fn().mockRejectedValue(new Error('network down')),
        },
      } as any;

      await expect(createSupabaseBridgeSession(client, 'user@example.com')).resolves.toBeNull();
      warnSpy.mockRestore();
    });
  });

  describe('ensureSupabaseAccountForEmail', () => {
    // No known Supabase id on file in the public.user registry -- the fast
    // path (getUserById + updateUserById) is skipped and every test below
    // falls through to the create-then-scan path it was already exercising.
    const noRegistryRow = () => ({
      select: () => ({
        eq: () => ({ maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }) }),
      }),
    });

    it('skips createUser/listUsers entirely when the registry already has a known Supabase id', async () => {
      const maybeSingle = jest.fn().mockResolvedValue({
        data: { provider_ids: { supabase: 'known-uuid' } },
        error: null,
      });
      const createUser = jest.fn();
      const listUsers = jest.fn();
      const getUserById = jest.fn().mockResolvedValue({
        data: { user: { id: 'known-uuid', user_metadata: { existing: true } } },
        error: null,
      });
      const updateUserById = jest.fn().mockResolvedValue({ error: null });
      const client = {
        from: jest.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
        auth: { admin: { createUser, listUsers, getUserById, updateUserById } },
      } as any;

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'known@example.com',
        userMetadata: { auth_provider: 'better-auth' },
      });

      expect(result).toEqual({ id: 'known-uuid' });
      expect(client.from).toHaveBeenCalledWith('user');
      expect(getUserById).toHaveBeenCalledWith('known-uuid');
      expect(updateUserById).toHaveBeenCalledWith(
        'known-uuid',
        expect.objectContaining({
          user_metadata: expect.objectContaining({ existing: true, auth_provider: 'better-auth' }),
        })
      );
      expect(createUser).not.toHaveBeenCalled();
      expect(listUsers).not.toHaveBeenCalled();
    });

    it('falls back to the create/scan path when the known id no longer resolves via getUserById', async () => {
      const maybeSingle = jest.fn().mockResolvedValue({
        data: { provider_ids: { supabase: 'stale-uuid' } },
        error: null,
      });
      const client = {
        from: jest.fn().mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
        auth: {
          admin: {
            getUserById: jest.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }),
            createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'new-uuid' } }, error: null }),
          },
        },
      } as any;

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'stale@example.com',
        userMetadata: {},
      });

      expect(result).toEqual({ id: 'new-uuid' });
      expect(client.auth.admin.createUser).toHaveBeenCalled();
    });

    it('creates a new account when none exists', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({ data: { user: { id: 'new-uuid' } }, error: null }),
          },
        },
      } as any;

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'new@example.com',
        userMetadata: { auth_provider: 'better-auth' },
      });

      expect(result).toEqual({ id: 'new-uuid' });
    });

    it('updates the existing account metadata on a duplicate-email error', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({ data: null, error: { message: 'User already registered' } }),
            listUsers: jest.fn().mockResolvedValue({
              data: { users: [{ id: 'existing-uuid', email: 'dup@example.com', user_metadata: { foo: 'bar' } }] },
              error: null,
            }),
            updateUserById: jest.fn().mockResolvedValue({ error: null }),
          },
        },
      } as any;

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'dup@example.com',
        userMetadata: { auth_provider: 'better-auth' },
      });

      expect(result).toEqual({ id: 'existing-uuid' });
      expect(client.auth.admin.updateUserById).toHaveBeenCalledWith(
        'existing-uuid',
        expect.objectContaining({
          user_metadata: expect.objectContaining({ foo: 'bar', auth_provider: 'better-auth' }),
        })
      );
    });

    it('returns null when a duplicate account exists but cannot be located by email', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({ data: null, error: { message: 'User already registered' } }),
            listUsers: jest.fn().mockResolvedValue({ data: { users: [] }, error: null }),
          },
        },
      } as any;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'ghost@example.com',
        userMetadata: {},
      });

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[Supabase Bridge] User already exists but could not be located for metadata update.'
      );
      warnSpy.mockRestore();
    });

    it('still returns the existing id when the metadata update itself fails', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({ data: null, error: { message: 'User already registered' } }),
            listUsers: jest.fn().mockResolvedValue({
              data: { users: [{ id: 'existing-uuid', email: 'dup@example.com', user_metadata: {} }] },
              error: null,
            }),
            updateUserById: jest.fn().mockResolvedValue({ error: { message: 'update failed' } }),
          },
        },
      } as any;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'dup@example.com',
        userMetadata: { auth_provider: 'better-auth' },
      });

      expect(result).toEqual({ id: 'existing-uuid' });
      expect(warnSpy).toHaveBeenCalledWith('[Supabase Bridge] Metadata update failed:', 'update failed');
      warnSpy.mockRestore();
    });

    it('returns null for a non-duplicate createUser error', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockResolvedValue({ data: null, error: { message: 'Invalid email' } }),
          },
        },
      } as any;

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'bad@example.com',
        userMetadata: {},
      });

      expect(result).toBeNull();
    });

    it('returns null for an empty email', async () => {
      const client = { auth: { admin: { createUser: jest.fn() } } } as any;
      const result = await ensureSupabaseAccountForEmail(client, { email: '', userMetadata: {} });
      expect(result).toBeNull();
      expect(client.auth.admin.createUser).not.toHaveBeenCalled();
    });

    it('returns null when an unexpected error is thrown', async () => {
      const client = {
        from: jest.fn().mockReturnValue(noRegistryRow()),
        auth: {
          admin: {
            createUser: jest.fn().mockRejectedValue(new Error('network down')),
          },
        },
      } as any;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await ensureSupabaseAccountForEmail(client, {
        email: 'user@example.com',
        userMetadata: {},
      });

      expect(result).toBeNull();
      warnSpy.mockRestore();
    });
  });
});
