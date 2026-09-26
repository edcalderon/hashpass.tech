import type { CapChallengeData, CapStorageHooks } from '@hashpass/backend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseServer } from '../supabase-server';

const CAPTCHA_STATE_TABLE = 'support_idempotency_keys';
const CAPTCHA_VISITOR_ID = '00000000-0000-0000-0000-000000000000';

type CaptchaStateKind = 'challenge' | 'token';
type StoredCaptchaRow = {
  key: string;
  response_body: { value?: unknown } | null;
};

export interface CaptchaStateRepository {
  store(kind: CaptchaStateKind, key: string, value: unknown): Promise<void>;
  consume(kind: CaptchaStateKind, key: string): Promise<unknown | null>;
  delete(kind: CaptchaStateKind, key: string): Promise<void>;
  deleteExpired(kind: CaptchaStateKind): Promise<void>;
}

const captchaExpiry = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && typeof (value as { expires?: unknown }).expires === 'number') {
    return (value as { expires: number }).expires;
  }
  return null;
};

/**
 * Map Cap's storage contract onto an atomic consume repository. Cap normally
 * reads and then deletes in two operations; consuming during read/get keeps a
 * solved challenge or token single-use even when concurrent Lambda instances
 * receive the requests. Cap's follow-up delete is intentionally idempotent.
 */
export const createCaptchaStorage = (repository: CaptchaStateRepository): CapStorageHooks => ({
  challenges: {
    store: (key, value) => repository.store('challenge', key, value),
    read: async (key) => (await repository.consume('challenge', key)) as CapChallengeData | null,
    delete: (key) => repository.delete('challenge', key),
    deleteExpired: () => repository.deleteExpired('challenge'),
  },
  tokens: {
    store: (key, value) => repository.store('token', key, value),
    get: async (key) => (await repository.consume('token', key)) as number | null,
    delete: (key) => repository.delete('token', key),
    deleteExpired: () => repository.deleteExpired('token'),
  },
});

const captchaRowScope = (query: any, appId: string, kind: CaptchaStateKind, key?: string) => {
  let scoped = query
    .eq('app_id', appId)
    .eq('visitor_id', CAPTCHA_VISITOR_ID)
    .eq('route', kind);
  if (key !== undefined) scoped = scoped.eq('key', key);
  return scoped;
};

export const createSupabaseCaptchaRepository = (
  namespace: string,
  supabase: SupabaseClient = supabaseServer,
): CaptchaStateRepository => {
  const appId = `captcha:${namespace}`;

  return {
    async store(kind, key, value) {
      const { error } = await supabase.from(CAPTCHA_STATE_TABLE).upsert(
        {
          app_id: appId,
          visitor_id: CAPTCHA_VISITOR_ID,
          route: kind,
          key,
          response_status: 200,
          response_body: { value },
          created_at: new Date().toISOString(),
        },
        { onConflict: 'app_id,visitor_id,route,key' },
      );
      if (error) throw new Error(`Unable to store captcha ${kind}: ${error.message}`);
    },

    async consume(kind, key) {
      const query = supabase.from(CAPTCHA_STATE_TABLE).delete();
      const { data, error } = await captchaRowScope(query, appId, kind, key)
        .select('response_body')
        .maybeSingle();
      if (error) throw new Error(`Unable to consume captcha ${kind}: ${error.message}`);
      return (data?.response_body as { value?: unknown } | null)?.value ?? null;
    },

    async delete(kind, key) {
      const { error } = await captchaRowScope(
        supabase.from(CAPTCHA_STATE_TABLE).delete(),
        appId,
        kind,
        key,
      );
      if (error) throw new Error(`Unable to delete captcha ${kind}: ${error.message}`);
    },

    async deleteExpired(kind) {
      const { data, error } = await captchaRowScope(
        supabase.from(CAPTCHA_STATE_TABLE).select('key,response_body'),
        appId,
        kind,
      ).limit(500);
      if (error) throw new Error(`Unable to read captcha ${kind} expiry: ${error.message}`);

      const now = Date.now();
      const expiredKeys = ((data ?? []) as StoredCaptchaRow[])
        .filter((row) => {
          const value = (row.response_body as { value?: unknown } | null)?.value;
          const expires = captchaExpiry(value);
          return expires !== null && expires <= now;
        })
        .map((row) => row.key);

      if (expiredKeys.length === 0) return;
      const deleteQuery = captchaRowScope(
        supabase.from(CAPTCHA_STATE_TABLE).delete(),
        appId,
        kind,
      );
      const { error: deleteError } = await deleteQuery.in('key', expiredKeys);
      if (deleteError) throw new Error(`Unable to clean captcha ${kind}: ${deleteError.message}`);
    },
  };
};

export const createSupabaseCaptchaStorage = (
  namespace: string,
  supabase: SupabaseClient = supabaseServer,
): CapStorageHooks => createCaptchaStorage(createSupabaseCaptchaRepository(namespace, supabase));
