/// <reference types="jest" />

import {
  createCaptchaStorage,
  createSupabaseCaptchaRepository,
  createSupabaseCaptchaStorage,
  type CaptchaStateRepository,
} from '../../../lib/server/captcha-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = {
  app_id: string;
  visitor_id: string;
  route: string;
  key: string;
  response_body: { value?: unknown } | null;
};

const createInMemorySupabase = () => {
  const rows: Row[] = [];

  class Query implements PromiseLike<{ data: any; error: null }> {
    private action: 'select' | 'delete' = 'select';
    private filters: Array<(row: Row) => boolean> = [];
    private returnRows = false;
    private maximum = Number.POSITIVE_INFINITY;

    select() {
      this.returnRows = true;
      return this;
    }

    delete() {
      this.action = 'delete';
      return this;
    }

    eq(column: keyof Row, value: unknown) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    in(column: keyof Row, values: unknown[]) {
      this.filters.push((row) => values.includes(row[column]));
      return this;
    }

    limit(maximum: number) {
      this.maximum = maximum;
      return this;
    }

    private async execute() {
      const matches = rows.filter((row) => this.filters.every((filter) => filter(row))).slice(0, this.maximum);
      if (this.action === 'delete') {
        for (const row of matches) rows.splice(rows.indexOf(row), 1);
        return { data: this.returnRows ? matches : null, error: null };
      }
      return { data: matches, error: null };
    }

    async maybeSingle() {
      const result = await this.execute();
      return { data: result.data?.[0] ?? null, error: null };
    }

    then<TResult1 = { data: any; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: any; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      return this.execute().then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: () => ({
      upsert: async (row: Row) => {
        const index = rows.findIndex(
          (candidate) =>
            candidate.app_id === row.app_id &&
            candidate.visitor_id === row.visitor_id &&
            candidate.route === row.route &&
            candidate.key === row.key,
        );
        if (index >= 0) rows[index] = row;
        else rows.push(row);
        return { data: null, error: null };
      },
      select: () => new Query().select(),
      delete: () => new Query().delete(),
    }),
  } as unknown as SupabaseClient;

  return { client, rows };
};

const createSharedRepository = (): CaptchaStateRepository => {
  const rows = new Map<string, unknown>();
  const rowKey = (kind: string, key: string) => `${kind}:${key}`;

  return {
    store: jest.fn(async (kind, key, value) => {
      rows.set(rowKey(kind, key), value);
    }),
    consume: jest.fn(async (kind, key) => {
      const id = rowKey(kind, key);
      const value = rows.get(id) ?? null;
      rows.delete(id);
      return value;
    }),
    delete: jest.fn(async (kind, key) => {
      rows.delete(rowKey(kind, key));
    }),
    deleteExpired: jest.fn(async () => undefined),
  };
};

describe('shared captcha storage', () => {
  it('lets a separate runtime consume a challenge exactly once', async () => {
    const repository = createSharedRepository();
    const issuer = createCaptchaStorage(repository);
    const redeemer = createCaptchaStorage(repository);
    const challenge = {
      expires: Date.now() + 60_000,
      challenge: { c: 10, s: 32, d: 3 },
    };

    await issuer.challenges!.store('challenge-id', challenge);

    await expect(redeemer.challenges!.read('challenge-id')).resolves.toEqual(challenge);
    await expect(issuer.challenges!.read('challenge-id')).resolves.toBeNull();
  });

  it('lets a separate runtime consume a solved token exactly once', async () => {
    const repository = createSharedRepository();
    const redeemer = createCaptchaStorage(repository);
    const proposalRoute = createCaptchaStorage(repository);
    const expires = Date.now() + 60_000;

    await redeemer.tokens!.store('token-hash', expires);

    await expect(proposalRoute.tokens!.get('token-hash')).resolves.toBe(expires);
    await expect(redeemer.tokens!.get('token-hash')).resolves.toBeNull();
  });

  it('persists and atomically consumes state through the shared Supabase table', async () => {
    const { client } = createInMemorySupabase();
    const issuer = createSupabaseCaptchaStorage('mobile-app', client);
    const separateRuntime = createSupabaseCaptchaStorage('mobile-app', client);
    const challenge = {
      expires: Date.now() + 60_000,
      challenge: { c: 10, s: 32, d: 3 },
    };

    await issuer.challenges.store('shared-challenge', challenge);
    await expect(separateRuntime.challenges.read('shared-challenge')).resolves.toEqual(challenge);
    await expect(issuer.challenges.read('shared-challenge')).resolves.toBeNull();

    const expires = Date.now() + 60_000;
    await issuer.tokens.store('shared-token', expires);
    await expect(separateRuntime.tokens.get('shared-token')).resolves.toBe(expires);
    await expect(issuer.tokens.get('shared-token')).resolves.toBeNull();
  });

  it('deletes explicit and expired shared rows without removing valid state', async () => {
    const { client } = createInMemorySupabase();
    const repository = createSupabaseCaptchaRepository('mobile-app', client);

    await repository.store('token', 'expired', Date.now() - 1);
    await repository.store('token', 'valid', Date.now() + 60_000);
    await repository.store('challenge', 'delete-me', {
      expires: Date.now() + 60_000,
      challenge: { c: 10, s: 32, d: 3 },
    });

    await repository.deleteExpired('token');
    await repository.delete('challenge', 'delete-me');

    await expect(repository.consume('token', 'expired')).resolves.toBeNull();
    await expect(repository.consume('token', 'valid')).resolves.toBeGreaterThan(Date.now());
    await expect(repository.consume('challenge', 'delete-me')).resolves.toBeNull();
  });
});
