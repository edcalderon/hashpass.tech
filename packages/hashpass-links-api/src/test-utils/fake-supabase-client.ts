import { randomUUID } from 'node:crypto';

// Minimal in-memory stand-in for the subset of the Supabase JS client this
// service actually calls (table CRUD via `.from()`, plus the `auth.admin`
// magic-link bridge used by `issueSessionForUser`). Just enough surface to
// drive the real route handlers end-to-end without a live database.

type Row = Record<string, unknown>;

type Predicate = (row: Row) => boolean;

// This in-memory store has no real schema, so column defaults that a real
// Postgres insert would apply silently (V079's `qr_auth_challenges.status
// DEFAULT 'pending'` and `qr_links.status DEFAULT 'active'`) have to be
// told explicitly, per table, here.
const TABLE_INSERT_DEFAULTS: Record<string, Row> = {
  qr_auth_challenges: { status: 'pending' },
  qr_links: { status: 'active' },
};

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private filters: Predicate[] = [];
  private wantsSingle = false;
  private sortBy: { column: string; ascending: boolean } | undefined;

  constructor(private readonly tableName: string, private readonly table: Map<string, Row>) {}

  insert(payload: Row): this {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row): this {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  select(_columns?: string): this {
    if (this.mode !== 'insert' && this.mode !== 'update') this.mode = 'select';
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  // `.is(column, null)` -- the only form this service's routes actually use
  // (soft-delete checks like `.is('deleted_at', null)`), so that's the only
  // form implemented here.
  is(column: string, value: null): this {
    this.filters.push((row) => (row[column] ?? null) === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    const set = new Set(values);
    this.filters.push((row) => set.has(row[column]));
    return this;
  }

  gte(column: string, value: string | number): this {
    this.filters.push((row) => (row[column] as string | number) >= value);
    return this;
  }

  lt(column: string, value: string | number): this {
    this.filters.push((row) => (row[column] as string | number) < value);
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}): this {
    this.sortBy = { column, ascending: options.ascending !== false };
    return this;
  }

  single(): this {
    this.wantsSingle = true;
    return this;
  }

  private matchedRows(): Row[] {
    const rows = [...this.table.values()].filter((row) => this.filters.every((predicate) => predicate(row)));
    if (!this.sortBy) return rows;

    const { column, ascending } = this.sortBy;
    return rows.sort((a, b) => {
      const left = a[column] as string | number;
      const right = b[column] as string | number;
      if (left === right) return 0;
      return (left > right ? 1 : -1) * (ascending ? 1 : -1);
    });
  }

  private execute(): { data: unknown; error: { message: string; code?: string } | null } {
    if (this.mode === 'insert') {
      const row: Row = {
        id: randomUUID(),
        ...(TABLE_INSERT_DEFAULTS[this.tableName] ?? {}),
        ...this.payload,
      };
      if (this.tableName === 'qr_links' && [...this.table.values()].some((existing) => existing.public_slug === row.public_slug)) {
        return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
      }
      this.table.set(row.id as string, row);
      return { data: row, error: null };
    }

    if (this.mode === 'update') {
      const rows = this.matchedRows();
      if (this.tableName === 'qr_links' && this.payload.public_slug !== undefined) {
        const updatingIds = new Set(rows.map((row) => row.id));
        if ([...this.table.values()].some((existing) => !updatingIds.has(existing.id) && existing.public_slug === this.payload.public_slug)) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
        }
      }
      for (const row of rows) Object.assign(row, this.payload);
      if (this.wantsSingle) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    const rows = this.matchedRows();
    if (this.wantsSingle) {
      const row = rows[0] ?? null;
      return { data: row, error: row ? null : { message: 'no rows found' } };
    }
    return { data: rows, error: null };
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: { message: string; code?: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export type FakeUser = { id: string; email: string; token: string };

export function createFakeSupabaseClient(users: FakeUser[] = []) {
  const tables = new Map<string, Map<string, Row>>();
  const usersByToken = new Map(users.map((user) => [user.token, user]));
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [user.email, user]));

  function tableFor(name: string): Map<string, Row> {
    let table = tables.get(name);
    if (!table) {
      table = new Map();
      tables.set(name, table);
    }
    return table;
  }

  return {
    from(name: string) {
      return new FakeQueryBuilder(name, tableFor(name));
    },
    auth: {
      async getUser(token: string) {
        const user = usersByToken.get(token);
        return { data: { user: user ?? null }, error: user ? null : { message: 'invalid token' } };
      },
      async verifyOtp({ token_hash }: { token_hash: string; type: string }) {
        const userId = token_hash.startsWith('otp:') ? token_hash.slice('otp:'.length) : null;
        const user = userId ? usersById.get(userId) : undefined;
        if (!user) return { data: { session: null }, error: { message: 'invalid token_hash' } };
        return {
          data: { session: { access_token: `access-${user.id}`, refresh_token: `refresh-${user.id}` } },
          error: null,
        };
      },
      admin: {
        async getUserById(id: string) {
          const user = usersById.get(id);
          return { data: { user: user ?? null }, error: user ? null : { message: 'not found' } };
        },
        async generateLink({ email }: { type: string; email: string }) {
          const user = usersByEmail.get(email);
          if (!user) return { data: null, error: { message: 'user not found' } };
          return {
            data: { properties: { verification_type: 'magiclink', hashed_token: `otp:${user.id}` } },
            error: null,
          };
        },
      },
    },
    // Test-only escape hatch for setting up/inspecting rows directly.
    _tables: tables,
  };
}

export type FakeSupabaseClient = ReturnType<typeof createFakeSupabaseClient>;
