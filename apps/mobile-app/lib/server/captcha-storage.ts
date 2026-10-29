import type { SupabaseClient } from '@supabase/supabase-js';
import type { CaptchaStateRepository } from '@hashpass/backend';
import {
  createCaptchaStorage,
  createSupabaseCaptchaRepository as createRepository,
  createSupabaseCaptchaStorage as createStorage,
} from '@hashpass/backend';
import { supabaseServer } from '../supabase-server';

// The storage implementation is shared with packages/hashpass-links-api (see
// packages/backend/src/captcha/supabase-storage.ts); this wrapper only binds
// the mobile app's service-role client as the default.
export { createCaptchaStorage };
export type { CaptchaStateRepository };

export const createSupabaseCaptchaRepository = (
  namespace: string,
  supabase: SupabaseClient = supabaseServer,
): CaptchaStateRepository => createRepository(namespace, supabase);

export const createSupabaseCaptchaStorage = (namespace: string, supabase: SupabaseClient = supabaseServer) =>
  createStorage(namespace, supabase);
