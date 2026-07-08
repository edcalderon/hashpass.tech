import { createClient, type Session, type User } from '@supabase/supabase-js';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { Platform } from 'react-native';
import { resolvePublicSupabaseConfig } from '../config/supabase-profiles';

let storage: any;

if (Platform.OS === 'web') {
  // For web, use localStorage if window is defined (client-side browser)
  // Otherwise, for SSR (Node.js environment), use a dummy storage
  storage = typeof window !== 'undefined' ? window.localStorage : {
    getItem: async (_key: string) => null,
    setItem: async (_key: string, _value: string) => {},
    removeItem: async (_key: string) => {},
  };
} else {
  // Keep this native-only path lazy without using dynamic import. Metro rewrites
  // dynamic import() through Expo's async-require helper, which is not present
  // in Android release bundles for this SDK combination.
  let asyncStorage: any = null;
  const loadAsyncStorage = () => {
    if (!asyncStorage) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const AsyncStorageModule = require('@react-native-async-storage/async-storage');
      asyncStorage = AsyncStorageModule.default ?? AsyncStorageModule;
    }
    return asyncStorage;
  };

  storage = {
    getItem: async (key: string) => {
      const AsyncStorage = loadAsyncStorage();
      return AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
      const AsyncStorage = loadAsyncStorage();
      return AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      const AsyncStorage = loadAsyncStorage();
      return AsyncStorage.removeItem(key);
    },
  };
}

type SupabaseEmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

const SUPABASE_EMAIL_OTP_FALLBACK_TYPES: SupabaseEmailOtpType[] = [
  'magiclink',
  'email',
  'signup',
  'invite',
  'recovery',
  'email_change',
];

const normalizeSupabaseEmailOtpType = (rawType: string | null | undefined): SupabaseEmailOtpType => {
  const normalized = (rawType || 'magiclink').trim().toLowerCase();

  switch (normalized) {
    case 'email':
    case 'signup':
    case 'invite':
    case 'recovery':
    case 'email_change':
      return normalized;
    default:
      return 'magiclink';
  }
};

const getSupabaseEmailOtpTypeCandidates = (rawType: string | null | undefined): SupabaseEmailOtpType[] => {
  const candidates = [
    normalizeSupabaseEmailOtpType(rawType),
    ...SUPABASE_EMAIL_OTP_FALLBACK_TYPES,
  ];

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
};


/**
 * Creates a session from a URL, typically after OAuth redirect
 * @param url The URL containing the authentication data
 * @returns The session data if successful
 */
export const createSessionFromUrl = async (url: string): Promise<{
  session: Session | null;
  user: User | null;
  error: Error | null;
}> => {
  const hydrateSessionUser = async (session: Session | null): Promise<{
    session: Session | null;
    user: User | null;
  }> => {
    if (!session) {
      return { session: null, user: null };
    }

    if (session.user) {
      return { session, user: session.user };
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const hydratedSession = {
          ...session,
          user,
        } as Session;

        return { session: hydratedSession, user };
      }
    } catch (userError) {
      console.warn('⚠️ Failed to hydrate Supabase session user:', userError);
    }

    try {
      const { data: { session: refreshedSession } } = await supabase.auth.getSession();
      if (refreshedSession?.user) {
        return { session: refreshedSession, user: refreshedSession.user };
      }
    } catch (sessionError) {
      console.warn('⚠️ Failed to re-read Supabase session after auth callback:', sessionError);
    }

    return { session, user: null };
  };

  try {
    // Parse URL parameters (QueryParams.getQueryParams handles both query string and hash)
    const { params, errorCode } = QueryParams.getQueryParams(url);
    const hasAuthParams = Boolean(
      params.access_token ||
      params.code ||
      params.refresh_token ||
      params.token_hash ||
      params.token ||
      errorCode
    );

    // If callback URL does not include auth payload, return existing session if available.
    // When tokens/code exist, we must process them explicitly to avoid stale auth state.
    if (!hasAuthParams) {
      const { data: { session: existingSession } } = await supabase.auth.getSession();
      if (existingSession && existingSession.user) {
        return { session: existingSession, user: existingSession.user, error: null };
      }

      if (existingSession) {
        const hydrated = await hydrateSessionUser(existingSession);
        if (hydrated.user) {
          return { session: hydrated.session, user: hydrated.user, error: null };
        }
      }
    }

    // Handle OAuth errors
    if (errorCode) {
      console.error('❌ OAuth error code:', errorCode);
      
      // Handle specific error cases that might still have valid sessions
      if (errorCode === 'server_error' || errorCode.includes('email')) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          return { session, user: null, error: null };
        }
      }
      
      throw new Error(`OAuth error: ${errorCode}`);
    }

    const { access_token, refresh_token, code } = params;
    const token_hash = typeof params.token_hash === 'string' ? params.token_hash.trim() : '';
    const token = typeof params.token === 'string' ? params.token.trim() : '';
    const otpType = typeof params.type === 'string' ? params.type : null;
    const otpEmail = typeof params.email === 'string' ? params.email.trim().toLowerCase() : '';

    // Method 1: Direct token setting (preferred)
    if (access_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token || '',
      });

      if (error) {
        console.error('❌ Error setting session:', error);
        
        // Check if session was created despite error
        const { data: { session: fallbackSession } } = await supabase.auth.getSession();
        if (fallbackSession) {
          const hydrated = await hydrateSessionUser(fallbackSession);
          return { session: hydrated.session, user: hydrated.user, error: null };
        }
        
        throw error;
      }

      const hydrated = await hydrateSessionUser(data.session);
      return { session: hydrated.session, user: hydrated.user, error: null };
    }

    // Method 2: Email OTP / magic link verification
    if (token_hash || (token && otpEmail)) {
      const verificationTypes = getSupabaseEmailOtpTypeCandidates(otpType);
      let lastVerificationError: Error | null = null;

      for (const verificationType of verificationTypes) {
        try {
          const verifyParams = token_hash
            ? { token_hash, type: verificationType }
            : { email: otpEmail, token, type: verificationType };

          const { data, error } = await supabase.auth.verifyOtp(verifyParams as any);

          if (error) {
            lastVerificationError = error;
            console.warn(
              `⚠️ Supabase email OTP verification failed for type "${verificationType}":`,
              error.message
            );
            continue;
          }

          if (!data?.session) {
            lastVerificationError = new Error('No session returned from email OTP verification');
            continue;
          }

          const hydrated = await hydrateSessionUser(data.session);
          return { session: hydrated.session, user: hydrated.user, error: null };
        } catch (verifyError: any) {
          lastVerificationError = verifyError instanceof Error
            ? verifyError
            : new Error(String(verifyError));
        }
      }

      if (lastVerificationError) {
        throw lastVerificationError;
      }
    }

    // Method 3: Authorization code exchange
    if (code) {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        
        if (error) {
          console.error('❌ Error exchanging code:', error);
          console.error('❌ Error details:', {
            message: error.message,
            status: (error as any).status,
            name: error.name
          });
          
          // Check if session was created despite error
          const { data: { session: fallbackSession } } = await supabase.auth.getSession();
          if (fallbackSession) {
            const hydrated = await hydrateSessionUser(fallbackSession);
            return { session: hydrated.session, user: hydrated.user, error: null };
          }
          
          throw error;
        }
        
        if (!data.session) {
          console.error('❌ No session returned from exchangeCodeForSession');
          throw new Error('No session returned from code exchange');
        }
        
        const hydrated = await hydrateSessionUser(data.session);
        return { session: hydrated.session, user: hydrated.user, error: null };
      } catch (exchangeError: any) {
        console.error('❌ Code exchange exception:', exchangeError);
        // Try one more time with getSession as fallback
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          const hydrated = await hydrateSessionUser(retrySession);
          return { session: hydrated.session, user: hydrated.user, error: null };
        }
        throw exchangeError;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      const hydrated = await hydrateSessionUser(session);
      return { session: hydrated.session, user: hydrated.user, error: null };
    }

    return { session: null, user: null, error: null };

  } catch (error: any) {
    console.error('❌ Error in createSessionFromUrl:', error);
    
    // Last resort: check for any existing session
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const hydrated = await hydrateSessionUser(session);
        return { session: hydrated.session, user: hydrated.user, error: null };
      }
    } catch (fallbackError) {
      console.error('❌ Fallback session check failed:', fallbackError);
    }
    
    throw error;
  }
};

const {
  profileId: supabaseProfileId,
  supabaseUrl,
  supabaseAnonKey,
} = resolvePublicSupabaseConfig();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(`Supabase URL or Anon Key is missing for profile "${supabaseProfileId}". Please check your .env file.`);
}

function createNoopSupabaseClient(errorMessage: string): ReturnType<typeof createClient> {
  const createNoopQuery = (result: { data: any; error: Error | null } = { data: null, error: null }) => {
    let queryProxy: any;

    const resolvedResult = Promise.resolve(result);

    queryProxy = new Proxy(function noopQuery() {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return resolvedResult.then.bind(resolvedResult);
        }

        if (prop === 'catch') {
          return resolvedResult.catch.bind(resolvedResult);
        }

        if (prop === 'finally') {
          return resolvedResult.finally.bind(resolvedResult);
        }

        if (
          prop === 'select' ||
          prop === 'insert' ||
          prop === 'update' ||
          prop === 'upsert' ||
          prop === 'delete' ||
          prop === 'eq' ||
          prop === 'neq' ||
          prop === 'gt' ||
          prop === 'gte' ||
          prop === 'lt' ||
          prop === 'lte' ||
          prop === 'like' ||
          prop === 'ilike' ||
          prop === 'is' ||
          prop === 'in' ||
          prop === 'contains' ||
          prop === 'containedBy' ||
          prop === 'rangeLt' ||
          prop === 'rangeGte' ||
          prop === 'rangeLte' ||
          prop === 'rangeAdjacent' ||
          prop === 'overlaps' ||
          prop === 'textSearch' ||
          prop === 'match' ||
          prop === 'not' ||
          prop === 'or' ||
          prop === 'filter' ||
          prop === 'order' ||
          prop === 'limit' ||
          prop === 'offset' ||
          prop === 'range' ||
          prop === 'single' ||
          prop === 'maybeSingle'
        ) {
          return () => queryProxy;
        }

        if (prop === 'subscribe') {
          return (callback?: (status: string) => void) => {
            callback?.('CLOSED');
            return queryProxy;
          };
        }

        if (prop === 'on') {
          return () => queryProxy;
        }

        if (prop === 'send') {
          return async () => ({ data: null, error: null });
        }

        if (prop === 'unsubscribe' || prop === 'remove') {
          return () => {};
        }

        return queryProxy;
      },
      apply() {
        return queryProxy;
      },
    });

    return queryProxy;
  };

  const createNoopAuthResponse = () => Promise.resolve({ data: { session: null, user: null }, error: null });
  const createNoopErrorResponse = () => Promise.resolve({ data: null, error: new Error(errorMessage) });

  const authProxy = new Proxy(function noopAuth() {}, {
    get(_target, prop) {
      switch (prop) {
        case 'getSession':
        case 'getUser':
        case 'refreshSession':
          return createNoopAuthResponse;
        case 'setSession':
        case 'exchangeCodeForSession':
        case 'verifyOtp':
        case 'signInWithPassword':
        case 'signInWithOAuth':
        case 'updateUser':
          return createNoopErrorResponse;
        case 'signOut':
          return async () => ({ error: null });
        case 'onAuthStateChange':
          return (callback?: (event: string, session: null) => void) => {
            callback?.('INITIAL_SESSION', null);
            return {
              data: {
                subscription: {
                  unsubscribe: () => {},
                },
              },
            };
          };
        default:
          return createNoopErrorResponse;
      }
    },
    apply() {
      return authProxy;
    },
  });

  const channelProxyFactory = () => {
    let channelProxy: any;

    channelProxy = new Proxy(function noopChannel() {}, {
      get(_target, prop) {
        if (
          prop === 'on' ||
          prop === 'join' ||
          prop === 'leave' ||
          prop === 'track' ||
          prop === 'untrack' ||
          prop === 'subscribe'
        ) {
          return () => channelProxy;
        }

        if (prop === 'send') {
          return async () => ({ error: null });
        }

        if (prop === 'unsubscribe' || prop === 'remove') {
          return () => {};
        }

        return channelProxy;
      },
      apply() {
        return channelProxy;
      },
    });

    return channelProxy;
  };

  return {
    from: () => createNoopQuery(),
    rpc: () => createNoopQuery(),
    channel: () => channelProxyFactory(),
    removeChannel: () => {},
    removeAllChannels: () => [],
    auth: authProxy,
    storage: {
      from: () => createNoopQuery(),
    },
  } as unknown as ReturnType<typeof createClient>;
}

// Initialize Supabase client
// Use try-catch to handle rootState.routeNames error gracefully
// CRITICAL: We handle all OAuth callbacks manually to avoid Supabase's site_url issues
// This gives us full control over redirect URLs and prevents incorrect redirects
let supabaseClient: ReturnType<typeof createClient> | null = null;

const initializeSupabase = () => {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('⚠️ Supabase env is missing; using a no-op client so the app can build safely.');
      return createNoopSupabaseClient(
        `Supabase URL or Anon Key is missing for profile "${supabaseProfileId}". Please check your .env file.`
      );
    }

    // Web handles auth callbacks explicitly in app/(shared)/auth/callback.tsx.
    // Keeping detectSessionInUrl off on web prevents Supabase from touching Expo Router
    // navigation state before the root navigator is ready.
    //
    // Native deep-link flows can still benefit from automatic session detection.
    const shouldDetectSessionInUrl = Platform.OS !== 'web';
    
    try {
      // Custom fetch function to ensure apikey header is always included
      // This is necessary when using custom domains like auth.hashpass.co
      // The Supabase client should add this automatically, but custom domains may not work correctly
      const customFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        // Start with headers from init, or create new Headers object
        const headers = new Headers(init?.headers);
        
        // If input is a Request object, also check its headers and merge them
        if (input instanceof Request) {
          // Merge headers from the Request object
          input.headers.forEach((value, key) => {
            if (!headers.has(key)) {
              headers.set(key, value);
            }
          });
        }
        
        // Convert input to URL string for inspection
        let urlString: string;
        if (typeof input === 'string') {
          urlString = input;
        } else if (input instanceof URL) {
          urlString = input.toString();
        } else if (input instanceof Request) {
          urlString = input.url;
        } else {
          urlString = String(input);
        }
        
        // Check if this is an auth endpoint (custom domain or standard)
        const isAuthEndpoint = urlString.includes('/auth/v1/') || urlString.includes('auth.hashpass.co');
        // OAuth authorize endpoints are constructed by Supabase - don't modify URL but ensure header
        const isAuthorizeEndpoint = urlString.includes('/auth/v1/authorize');
        // Ensure apikey header is always present for Supabase API requests
        // This is critical for custom auth domains
        if (!headers.has('apikey') && supabaseAnonKey) {
          headers.set('apikey', supabaseAnonKey);
        }
        
        // For auth endpoints (except authorize which Supabase constructs), also add apikey as query parameter
        // Some Supabase auth endpoints require it as a query param for custom domains
        // Authorize endpoints get apikey from header only to avoid breaking redirect flow
        // Verify and token endpoints MUST have apikey as query param for custom domains to work
        let finalInput: RequestInfo | URL = input;
        if (isAuthEndpoint && !isAuthorizeEndpoint && supabaseAnonKey) {
          try {
            const url = new URL(urlString);
            if (!url.searchParams.has('apikey')) {
              url.searchParams.set('apikey', supabaseAnonKey);
              // Create new input with updated URL
              if (typeof input === 'string') {
                finalInput = url.toString();
              } else if (input instanceof URL) {
                finalInput = url;
              } else if (input instanceof Request) {
                // For Request objects, create a new one with updated URL
                // Note: Request.body is a ReadableStream and can only be read once
                // For GET requests (like /auth/v1/user), body is null
                // Merge headers from original request with our custom headers
                const mergedHeaders = new Headers(input.headers);
                // CRITICAL: Always add apikey header for auth endpoints
                // Supabase may not include it for custom domains
                if (!mergedHeaders.has('apikey') && supabaseAnonKey) {
                  mergedHeaders.set('apikey', supabaseAnonKey);
                }
                
                const requestInit: RequestInit = {
                  method: input.method,
                  headers: mergedHeaders,
                  mode: input.mode,
                  credentials: input.credentials,
                  cache: input.cache,
                  redirect: input.redirect,
                  referrer: input.referrer,
                  referrerPolicy: input.referrerPolicy,
                  integrity: input.integrity,
                };
                
                // Only include body if it exists and method allows it
                // For GET/HEAD requests, body should be null/undefined
                if (input.body !== null && input.method !== 'GET' && input.method !== 'HEAD') {
                  // For requests with body, we need to clone it
                  // But Request.body can only be read once, so we need to be careful
                  try {
                    requestInit.body = input.body;
                  } catch (e) {
                    console.warn('Could not copy request body:', e);
                  }
                }
                
                finalInput = new Request(url, requestInit);
              }
            }
          } catch (e) {
            // If URL parsing fails, continue with original input
            console.warn('Failed to parse URL for apikey query param:', e);
          }
        }
        
        // When finalInput is a Request object, don't override its headers
        // The Request object already has the merged headers with apikey
        if (finalInput instanceof Request) {
          // eslint-disable-next-line no-restricted-syntax
          return fetch(finalInput);
        }
        
        // For string/URL inputs, use the headers we've prepared
        // eslint-disable-next-line no-restricted-syntax
        return fetch(finalInput, {
          ...init,
          headers
        });
      };

      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: storage,
          autoRefreshToken: true,
          persistSession: true,
          // Only auto-detect sessions on native. Web uses the explicit callback route.
          detectSessionInUrl: shouldDetectSessionInUrl,
          // PKCE ensures magic links return ?code=... (not #access_token=... implicit flow).
          // The code_verifier is stored in the same storage adapter (AsyncStorage on native,
          // localStorage on web), so the client that sent the OTP can always exchange the code.
          flowType: 'pkce',
        },
        global: {
          headers: {
            'apikey': supabaseAnonKey
          },
          fetch: customFetch
        }
      });
    } catch (error: any) {
      // If initialization fails for any reason, retry with the same safe web/native setting.
      const isNavigationError = error?.message?.includes('routeNames') || 
                                 error?.message?.includes('rootState') ||
                                 error?.message?.includes('navigation');
      
      if (isNavigationError) {
        console.warn('⚠️ Supabase init error (navigation state not ready), retrying with safe session detection settings:', error?.message);
      } else {
        console.warn('⚠️ Supabase init error, retrying with safe session detection settings:', error);
      }
      try {
        // Custom fetch function for fallback initialization
        const customFetch: typeof fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          // Start with headers from init, or create new Headers object
          const headers = new Headers(init?.headers);
          
          // If input is a Request object, also check its headers and merge them
          if (input instanceof Request) {
            // Merge headers from the Request object
            input.headers.forEach((value, key) => {
              if (!headers.has(key)) {
                headers.set(key, value);
              }
            });
          }
          
          // Convert input to URL string for inspection
          let urlString: string;
          if (typeof input === 'string') {
            urlString = input;
          } else if (input instanceof URL) {
            urlString = input.toString();
          } else if (input instanceof Request) {
            urlString = input.url;
          } else {
            urlString = String(input);
          }
          
          // Check if this is an auth endpoint
          const isAuthEndpoint = urlString.includes('/auth/v1/') || urlString.includes('auth.hashpass.co');
          // OAuth authorize endpoints should not have URL modified (they handle redirects)
          const isAuthorizeEndpoint = urlString.includes('/auth/v1/authorize');
          // Ensure apikey header is always present
          if (!headers.has('apikey') && supabaseAnonKey) {
            headers.set('apikey', supabaseAnonKey);
          }
          
          // For auth endpoints (except authorize), also add apikey as query parameter
          // Verify endpoints MUST have apikey as query param for custom domains to work
          let finalInput: RequestInfo | URL = input;
          if (isAuthEndpoint && !isAuthorizeEndpoint && supabaseAnonKey) {
            try {
              const url = new URL(urlString);
              if (!url.searchParams.has('apikey')) {
                url.searchParams.set('apikey', supabaseAnonKey);
                // Create new input with updated URL
                if (typeof input === 'string') {
                  finalInput = url.toString();
                } else if (input instanceof URL) {
                  finalInput = url;
                } else if (input instanceof Request) {
                  // For Request objects, create a new one with updated URL
                  // Note: Request.body is a ReadableStream and can only be read once
                  // For GET requests (like /auth/v1/user), body is null
                  // Merge headers from original request with our custom headers
                  const mergedHeaders = new Headers(input.headers);
                  // CRITICAL: Always add apikey header for auth endpoints
                  // Supabase may not include it for custom domains
                  if (!mergedHeaders.has('apikey') && supabaseAnonKey) {
                    mergedHeaders.set('apikey', supabaseAnonKey);
                  }
                  
                  const requestInit: RequestInit = {
                    method: input.method,
                    headers: mergedHeaders,
                    mode: input.mode,
                    credentials: input.credentials,
                    cache: input.cache,
                    redirect: input.redirect,
                    referrer: input.referrer,
                    referrerPolicy: input.referrerPolicy,
                    integrity: input.integrity,
                  };
                  
                  // Only include body if it exists and method allows it
                  if (input.body !== null && input.method !== 'GET' && input.method !== 'HEAD') {
                    try {
                      requestInit.body = input.body;
                    } catch (e) {
                      console.warn('Could not copy request body:', e);
                    }
                  }
                  
                  finalInput = new Request(url, requestInit);
                }
              }
            } catch {
              // Ignore URL parsing errors
            }
          }
          
          // When finalInput is a Request object, don't override its headers
          // The Request object already has the merged headers with apikey
          if (finalInput instanceof Request) {
            // eslint-disable-next-line no-restricted-syntax
            return fetch(finalInput);
          }
          
          // For string/URL inputs, use the headers we've prepared
          // eslint-disable-next-line no-restricted-syntax
          return fetch(finalInput, {
            ...init,
            headers
          });
        };

        supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            storage: storage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: shouldDetectSessionInUrl,
            flowType: 'pkce',
          },
          global: {
            headers: {
              'apikey': supabaseAnonKey
            },
            fetch: customFetch
          }
        });
      } catch (retryError) {
        console.error('Error creating Supabase client:', retryError);
        throw retryError;
      }
    }
  }
  return supabaseClient;
};

// Initialize immediately
export const supabase = initializeSupabase();
