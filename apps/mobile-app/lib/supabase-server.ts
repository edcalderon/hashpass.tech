import { createClient } from '@supabase/supabase-js';
import {
  hostnameFromRequest,
  resolveServerSupabaseConfig,
  type ServerSupabaseConfig,
} from '../config/supabase-profiles';
import { getEventSupabaseProfileId } from './server/event-supabase-profile';
import { loadServerEnvFiles } from './server/load-server-env';

// This client is specifically for server-side operations
// Only use this in API routes/server-side code
// DO NOT import this in client-side components - use lib/supabase.ts instead

export function getSupabaseServerEnv(input?: Request | { hostname?: string; profileId?: string }): ServerSupabaseConfig & {
  selectedProfile: string;
  usingDevFallback: boolean;
} {
  loadServerEnvFiles();

  const hostname = input instanceof Request ? hostnameFromRequest(input) : input?.hostname;
  const resolved = resolveServerSupabaseConfig({
    hostname,
    profileId: input instanceof Request ? undefined : input?.profileId,
  });

  return {
    ...resolved,
    selectedProfile: resolved.profileId,
    usingDevFallback: resolved.usingFallback,
  };
}

// Lazy initialization - only create clients when actually used
const supabaseServerClients = new Map<string, any>();

function createMockSupabaseClient(errorMsg: string): ReturnType<typeof createClient> {
  // Create a mock chainable object that simulates Supabase query API.
  const createMockQuery = (): any => {
    return {
      select: () => createMockQuery(),
      insert: () => createMockQuery(),
      update: () => createMockQuery(),
      delete: () => createMockQuery(),
      eq: () => createMockQuery(),
      neq: () => createMockQuery(),
      gt: () => createMockQuery(),
      gte: () => createMockQuery(),
      lt: () => createMockQuery(),
      lte: () => createMockQuery(),
      like: () => createMockQuery(),
      ilike: () => createMockQuery(),
      is: () => createMockQuery(),
      in: () => createMockQuery(),
      contains: () => createMockQuery(),
      containedBy: () => createMockQuery(),
      rangeLt: () => createMockQuery(),
      rangeGte: () => createMockQuery(),
      rangeLte: () => createMockQuery(),
      rangeAdjacent: () => createMockQuery(),
      overlaps: () => createMockQuery(),
      textSearch: () => createMockQuery(),
      match: () => createMockQuery(),
      not: () => createMockQuery(),
      or: () => createMockQuery(),
      filter: () => createMockQuery(),
      order: () => createMockQuery(),
      limit: () => createMockQuery(),
      offset: () => createMockQuery(),
      range: () => createMockQuery(),
      single: () => createMockQuery(),
      maybeSingle: () => createMockQuery(),
      then: (onFulfilled?: any, onRejected?: any) => {
        const result = Promise.resolve({ data: null, error: new Error(errorMsg) });
        return result.then(onFulfilled, onRejected);
      },
      catch: (onRejected?: any) => {
        const result = Promise.resolve({ data: null, error: new Error(errorMsg) });
        return result.catch(onRejected);
      },
      finally: (onFinally?: any) => {
        const result = Promise.resolve({ data: null, error: new Error(errorMsg) });
        return result.finally(onFinally);
      },
    };
  };

  return {
    from: () => createMockQuery(),
    rpc: () => createMockQuery(),
    auth: { admin: {} },
  } as unknown as ReturnType<typeof createClient>;
}

function getSupabaseServer(input?: Request | { hostname?: string; profileId?: string }) {
  // Check if we're in a browser/client environment
  const isClient = typeof window !== 'undefined' && !(input instanceof Request);

  // If we're in client environment, this should not be used
  if (isClient) {
    console.error('⚠️ ERROR: supabase-server.ts is being imported in client-side code!');
    console.error('This file should ONLY be used in server-side API routes.');
    console.error('For client-side code, use lib/supabase.ts instead.');
    throw new Error('supabase-server.ts should only be used in server-side API routes. For client-side code, use lib/supabase.ts instead.');
  }

  const { supabaseUrl, supabaseServiceKey, usingDevFallback, selectedProfile, profileId } =
    getSupabaseServerEnv(input);

  // Check for missing environment variables - but don't crash, return a mock client
  if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = [];
    if (!supabaseUrl) {
      missingVars.push('Supabase public URL missing (dev fallback available)');
    }
    if (!supabaseServiceKey) {
      missingVars.push('Supabase service role key missing (dev fallback available)');
    }

    const errorMsg = `Missing Supabase environment variables: ${missingVars.join(', ')}. ` +
      `API routes will return graceful error responses. ` +
      `Selected profile: ${selectedProfile}. ` +
      `Using DEV fallback: ${usingDevFallback ? 'YES' : 'NO'}. ` +
      `Current values: EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl ? 'SET' : 'MISSING'}, ` +
      `SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey ? 'SET' : 'MISSING'}`;

    console.warn('⚠️ Supabase Server Configuration Warning:', errorMsg);

    return createMockSupabaseClient(errorMsg);
  }

  const cachedClient = supabaseServerClients.get(profileId);
  if (cachedClient) return cachedClient;

  {
    // Custom fetch function to ensure apikey header is always included
    // This is necessary when using custom domains like auth.hashpass.co
    const customFetch = async (url: RequestInfo | URL, options: RequestInit = {}) => {
      // Handle different input types for url
      let urlString: string;
      if (typeof url === 'string') {
        urlString = url;
      } else if (url instanceof URL) {
        urlString = url.toString();
      } else {
        // Request object
        urlString = url.url;
      }

      const headers = new Headers(options.headers);

      // Ensure apikey header is always present for Supabase API requests
      // The Supabase client should add this automatically, but custom domains may not work correctly
      if (!headers.has('apikey') && supabaseServiceKey) {
        headers.set('apikey', supabaseServiceKey);
      }

      // Convert Headers to plain object for maximum compatibility with undici/node-fetch
      const headersPlain: Record<string, string> = {};
      headers.forEach((value, key) => {
        headersPlain[key] = value;
      });

      try {
        // eslint-disable-next-line no-restricted-syntax
        const response = await fetch(urlString, {
          ...options,
          headers: headersPlain,
        });

        if (!response.ok) {
          // Log non-200 responses for debugging (optional, but helpful)
          // console.log(`Supabase request failed: ${response.status} ${response.statusText} for ${url}`);
        }

        return response;
      } catch (error: any) {
        // Detailed error logging for debugging Lambda environment issues
        console.error('❌ Supabase Custom Fetch Error:', {
          message: error.message,
          cause: error.cause,
          code: error.code,
          name: error.name,
          url: urlString.replace(supabaseUrl || '', '[REDACTED_URL]'), // Redact base URL if possible
          headers: Object.keys(headersPlain), // Log which headers were sent (keys only)
        });

        // Re-throw to let Supabase client handle it (or fail)
        throw error;
      }
    };

    const client = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          'apikey': supabaseServiceKey
        },
        fetch: customFetch
      }
    });

    supabaseServerClients.set(profileId, client);
  }

  return supabaseServerClients.get(profileId)!;
}

/**
 * Resolve an explicit profile override first, then event affinity from the
 * request path. Event API routes must use the API request hostname for profile
 * selection so a caller-controlled Origin cannot switch CBWeek environments.
 */
export const getSupabaseProfileIdForRequest = (
  request: Request,
  profileId?: string,
): string | undefined => {
  if (profileId) return profileId;

  const requestUrl = new URL(request.url);
  const pathSegments = requestUrl.pathname.split('/').filter(Boolean);
  const eventsIndex = pathSegments.indexOf('events');
  const pathEventId = eventsIndex >= 0 ? pathSegments[eventsIndex + 1] : undefined;
  const queryEventId = requestUrl.searchParams.get('eventId')?.trim();
  const queryEventIds = requestUrl.searchParams.get('eventIds')
    ?.split(',')
    .map((eventId) => eventId.trim())
    .filter(Boolean) || [];
  const isLegacyBslRoute = pathSegments[0] === 'api' && pathSegments[1] === 'bsl';
  const eventId = pathEventId || queryEventId;
  const eventProfileId = eventId ? getEventSupabaseProfileId(request, eventId) : undefined;
  if (eventProfileId) return eventProfileId;

  if (!eventId) {
    for (const queryEventId of queryEventIds) {
      const profileId = getEventSupabaseProfileId(request, queryEventId);
      if (profileId) return profileId;
    }
  }
  if (!eventId && isLegacyBslRoute) {
    const profileId = getEventSupabaseProfileId(request, 'bsl');
    if (profileId) return profileId;
  }

  // The first-party API hostname determines the runtime environment even for
  // unscoped/token-based routes that have no event id available yet. Origin is
  // caller-controlled and must not switch a production API request to dev.
  if (requestUrl.hostname === 'api.hashpass.tech') return 'core-production';
  if (requestUrl.hostname === 'api-dev.hashpass.tech') return 'core-development';
  return undefined;
};

/**
 * Resolve the server client for a request, optionally overriding event-profile
 * inference. Local Expo requests all arrive as `localhost`, but event-scoped
 * BSL admin routes still need the BSL Supabase project rather than the core
 * project selected by that hostname.
 */
export const getSupabaseProfileIdForEventRequest = (
  request: Request,
  eventId: string,
): string | undefined =>
  getEventSupabaseProfileId(request, eventId) || getSupabaseProfileIdForRequest(request);

export const getSupabaseServerForRequest = (
  request: Request,
  profileId?: string,
) => {
  const resolvedProfileId = getSupabaseProfileIdForRequest(request, profileId);
  return resolvedProfileId
    ? getSupabaseServer({ profileId: resolvedProfileId })
    : getSupabaseServer(request);
};

// Check if we're in a browser/client environment BEFORE creating the Proxy
const isBrowser = typeof window !== 'undefined';

// Export as a Proxy to allow lazy initialization
// If we're in a browser, export a dummy that throws helpful error
// If we're in server, export the real client
export const supabaseServer = isBrowser
  ? new Proxy({} as ReturnType<typeof createClient>, {
    get(_target, prop) {
      // In browser, throw helpful error
      throw new Error(
        'supabase-server.ts should only be used in server-side API routes. ' +
        'For client-side code, use lib/supabase.ts instead. ' +
        `Attempted to access: ${String(prop)}`
      );
    }
  })
  : new Proxy({} as ReturnType<typeof createClient>, {
    get(_target, prop) {
      const client = getSupabaseServer();
      const value = (client as any)[prop];

      // If it's a function, bind it to the client
      if (typeof value === 'function') {
        return value.bind(client);
      }

      return value;
    }
  });
