/**
 * Backend provider - thin wrapper around @hashpass/backend.
 * Registers Supabase client and re-exports getBackend / getBackendAsync.
 */

import {
  registerSupabaseClients,
  getBackend,
  getBackendAsync,
  getProviderType,
  resetProvider,
  isSupabase,
  isDirectus,
} from '@hashpass/backend';
import type { BackendProvider } from '@hashpass/backend';
import type { IBackendProvider } from '@hashpass/backend';
import { supabase } from '../supabase';

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registered = true;
  try {
    const { supabaseServer } = require('../supabase-server');
    registerSupabaseClients(supabase, supabaseServer);
  } catch {
    registerSupabaseClients(supabase);
  }
}
ensureRegistered();

export type { BackendProvider, IBackendProvider };
export {
  getBackend,
  getBackendAsync,
  getProviderType,
  resetProvider,
  isSupabase,
  isDirectus,
};
export * from '@hashpass/backend';
export default getBackend;
