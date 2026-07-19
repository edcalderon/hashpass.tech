/// <reference types="jest" />

const mockFrom = jest.fn();

jest.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// eslint-disable-next-line import/first
import {
  getUserAdminRole,
  hasAdminRole,
  isAdmin,
  isAdminOrHigher,
  isSuperAdmin,
} from '../../lib/admin-utils';

describe('admin-utils role checks', () => {
  const userId = '7f60f5d2-5948-4df1-9670-2f9177cf2fe4';

  const mockLimitQuery = (result: unknown) => {
    const inFn = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(result) });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: inFn,
    };
    mockFrom.mockReturnValueOnce(query);
    return { query, inFn };
  };

  const mockOrderQuery = (result: unknown) => {
    const inFn = jest.fn().mockReturnValue({ order: jest.fn().mockResolvedValue(result) });
    const query = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: inFn,
    };
    mockFrom.mockReturnValueOnce(query);
    return { query, inFn };
  };

  beforeEach(() => {
    mockFrom.mockReset();
  });

  it('queries the real Postgres user_role enum values, not camelCase/nonexistent ones', async () => {
    // Regression for: db/migrations/V001__init_core_schema.sql defines
    // `user_role` as ('user', 'speaker', 'organizer', 'admin', 'super_admin').
    // Querying 'superAdmin' or 'moderator' makes Postgres reject the whole
    // `.in()` list with "invalid input value for enum user_role", which
    // silently broke every admin check in the app (always fell through to
    // an error and returned false).
    const { inFn } = mockLimitQuery({ data: [], error: null });

    await isAdmin(userId);

    expect(inFn).toHaveBeenCalledWith('role', ['super_admin', 'admin']);
  });

  it('returns true when the user has an admin role', async () => {
    mockLimitQuery({ data: [{ role: 'admin' }], error: null });

    await expect(isAdmin(userId)).resolves.toBe(true);
  });

  it('returns false when the query errors (e.g. invalid enum value)', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockLimitQuery({
      data: null,
      error: { code: '22P02', message: 'invalid input value for enum user_role: "superAdmin"' },
    });

    await expect(isAdmin(userId)).resolves.toBe(false);
    errorSpy.mockRestore();
  });

  it('resolves the highest admin role as super_admin over admin', async () => {
    mockOrderQuery({ data: [{ role: 'admin' }, { role: 'super_admin' }], error: null });

    await expect(getUserAdminRole(userId)).resolves.toBe('super_admin');
  });

  it('hasAdminRole treats super_admin as satisfying an admin requirement', async () => {
    mockOrderQuery({ data: [{ role: 'super_admin' }], error: null });

    await expect(hasAdminRole(userId, 'admin')).resolves.toBe(true);
  });

  it('isSuperAdmin is false for a plain admin role', async () => {
    mockOrderQuery({ data: [{ role: 'admin' }], error: null });

    await expect(isSuperAdmin(userId)).resolves.toBe(false);
  });

  it('isAdminOrHigher is true for a plain admin role', async () => {
    mockOrderQuery({ data: [{ role: 'admin' }], error: null });

    await expect(isAdminOrHigher(userId)).resolves.toBe(true);
  });
});
