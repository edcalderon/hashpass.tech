/// <reference types="jest" />

import {
  normalizeEmail,
  isDuplicateSupabaseUserError,
  findSupabaseUserByEmail,
  issueSupabaseSessionBridge,
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

      return findSupabaseUserByEmail(client, 'Target@Example.com').then((user) => {
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
  });

  describe('ensureSupabaseAccountForEmail', () => {
    it('creates a new account when none exists', async () => {
      const client = {
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

    it('returns null for a non-duplicate createUser error', async () => {
      const client = {
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
