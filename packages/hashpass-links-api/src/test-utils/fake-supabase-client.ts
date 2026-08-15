import { randomUUID } from 'node:crypto';

// Minimal in-memory stand-in for the subset of the Supabase JS client this
// service actually calls (table CRUD via `.from()`, plus the `auth.admin`
// magic-link bridge used by `issueSessionForUser`). Just enough surface to
// drive the real route handlers end-to-end without a live database.

type Row = Record<string, unknown>;

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private mode: 'select' | 'insert' | 'update' = 'select';
  private payload: Row = {};
  private filters: Array<[string, unknown]> = [];
  private wantsSingle = false;

  constructor(private readonly table: Map<string, Row>) {}

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
    this.filters.push([column, value]);
    return this;
  }

  single(): this {
    this.wantsSingle = true;
    return this;
  }

  private matchedRows(): Row[] {
    return [...this.table.values()].filter((row) => this.filters.every(([column, value]) => row[column] === value));
  }

  private execute(): { data: unknown; error: { message: string } | null } {
    if (this.mode === 'insert') {
      // Mirrors the `qr_auth_challenges.status` column default in
      // db/migrations/V079__hashpass_links_dynamic_qr.sql -- a real Postgres
      // insert that omits `status` gets 'pending' from the column default;
      // this in-memory table has no schema/defaults of its own, so it has to
      // be told explicitly.
      const row: Row = { id: randomUUID(), status: 'pending', ...this.payload };
      this.table.set(row.id as string, row);
      return { data: row, error: null };
    }

    if (this.mode === 'update') {
      const rows = this.matchedRows();
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
    onfulfilled?: ((value: { data: unknown; error: { message: string } | null }) => TResult1 | PromiseLike<TResult1>) | null,
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
      return new FakeQueryBuilder(tableFor(name));
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
