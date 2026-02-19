import { createClient, type Session, type User } from '@supabase/supabase-js';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { Platform } from 'react-native';

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
  // For native (iOS, Android), use lazy initialization with dynamic import
  // This prevents AsyncStorage from being evaluated in Node.js environments
  // if it has top-level dependencies on browser globals.
  // Initialize with a proxy that loads AsyncStorage on first access
  let asyncStorage: any = null;
  const loadAsyncStorage = async () => {
    if (!asyncStorage) {
      const AsyncStorageModule = await import('@react-native-async-storage/async-storage');
      asyncStorage = AsyncStorageModule.default;
    }
    return asyncStorage;
  };
  
  storage = {
    getItem: async (key: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return AsyncStorage.getItem(key);
    },
    setItem: async (key: string, value: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return AsyncStorage.setItem(key, value);
    },
    removeItem: async (key: string) => {
      const AsyncStorage = await loadAsyncStorage();
      return AsyncStorage.removeItem(key);
    },
  };
}


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
  console.log('🔍 Creating session from URL:', url.substring(0, 100) + '...');
  console.log('🔍 Full URL length:', url.length);
  console.log('🔍 URL contains hash:', url.includes('#'));
  console.log('🔍 URL contains ?code=', url.includes('?code=') || url.includes('&code=') || url.includes('#code='));
  console.log('🔍 URL contains #access_token=', url.includes('#access_token='));
  
  try {
    // First, check if we already have a session (Supabase might have auto-processed)
    const { data: { session: existingSession } } = await supabase.auth.getSession();
    if (existingSession && existingSession.user) {
      console.log('✅ Session already exists, returning it');
      return { session: existingSession, user: null, error: null };
    }
    
    // Parse URL parameters (QueryParams.getQueryParams handles both query string and hash)
    const { params, errorCode } = QueryParams.getQueryParams(url);
    
    console.log('📋 URL params parsed:', {
      hasAccessToken: !!params.access_token,
      hasRefreshToken: !!params.refresh_token,
      hasCode: !!params.code,
      errorCode,
      paramsKeys: Object.keys(params),
      codeLength: params.code ? String(params.code).length : 0,
      accessTokenLength: params.access_token ? String(params.access_token).length : 0,
    });

    // Handle OAuth errors
    if (errorCode) {
      console.error('❌ OAuth error code:', errorCode);
      
      // Handle specific error cases that might still have valid sessions
      if (errorCode === 'server_error' || errorCode.includes('email')) {
        console.log('ℹ️ Checking for existing session despite error...');
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('✅ Found existing session despite error');
          return { session, user: null, error: null };
        }
      }
      
      throw new Error(`OAuth error: ${errorCode}`);
    }

    const { access_token, refresh_token, code } = params;

    // Method 1: Direct token setting (preferred)
    if (access_token) {
      console.log('🎫 Setting session with access token...');
      
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token: refresh_token || '',
      });

      if (error) {
        console.error('❌ Error setting session:', error);
        
        // Check if session was created despite error
        const { data: { session: fallbackSession } } = await supabase.auth.getSession();
        if (fallbackSession) {
          console.log('✅ Session exists despite setSession error');
          return { session: fallbackSession, user: null, error: null };
        }
        
        throw error;
      }

      console.log('✅ Session created successfully with tokens');
      return { session: data.session, user: null, error: null };
    }

    // Method 2: Authorization code exchange
    if (code) {
      console.log('🔄 Exchanging authorization code for session...');
      console.log('📝 Code (first 20 chars):', code.substring(0, 20) + '...');
      
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
            console.log('✅ Session exists despite exchangeCodeForSession error');
            return { session: fallbackSession, user: null, error: null };
          }
          
          throw error;
        }
        
        if (!data.session) {
          console.error('❌ No session returned from exchangeCodeForSession');
          throw new Error('No session returned from code exchange');
        }
        
        console.log('✅ Session created successfully via code exchange');
        console.log('👤 User ID:', data.session.user.id);
        return { session: data.session, user: null, error: null };
      } catch (exchangeError: any) {
        console.error('❌ Code exchange exception:', exchangeError);
        // Try one more time with getSession as fallback
        const { data: { session: retrySession } } = await supabase.auth.getSession();
        if (retrySession) {
          console.log('✅ Found session on retry after code exchange error');
          return { session: retrySession, user: null, error: null };
        }
        throw exchangeError;
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      return { session, user: null, error: null };
    }

    return { session: null, user: null, error: null };

  } catch (error: any) {
    console.error('❌ Error in createSessionFromUrl:', error);
    
    // Last resort: check for any existing session
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        return { session, user: null, error: null };
      }
    } catch (fallbackError) {
      console.error('❌ Fallback session check failed:', fallbackError);
    }
    
    throw error;
  }
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase URL or Anon Key is missing. Please check your .env file.');
}

// Initialize Supabase client
// Use try-catch to handle rootState.routeNames error gracefully
// CRITICAL: We handle all OAuth callbacks manually to avoid Supabase's site_url issues
// This gives us full control over redirect URLs and prevents incorrect redirects
let supabaseClient: ReturnType<typeof createClient> | null = null;

const initializeSupabase = () => {
  if (!supabaseClient) {
    // Allow detectSessionInUrl to enable automatic session detection from URL
    // This can help with OAuth callbacks and deep linking
    // However, we need to be careful - it can cause errors if navigation state isn't ready
    // 
    // CRITICAL: On web, we normally disable detectSessionInUrl because:
    // 1. We handle OAuth callbacks manually in the callback handler
    // 2. detectSessionInUrl can try to access navigation state (rootState.routeNames) before it's ready
    // 3. This causes "rootState.routeNames is undefined" errors on web
    // 
    // HOWEVER: For OTP to work properly on production, we need detectSessionInUrl enabled
    // because OTP verification creates session tokens that need to be detected from URL
    // We'll handle any navigation errors gracefully in the catch block
    let shouldDetectSessionInUrl = true; // Enable for OTP to work on production
    
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
        // Verify endpoints need apikey as query param for custom domains
        const isVerifyEndpoint = urlString.includes('/auth/v1/verify');
        // Token exchange endpoint (for code exchange) needs apikey
        const isTokenEndpoint = urlString.includes('/auth/v1/token');
        
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
        
        // Log for debugging auth endpoints (can be removed in production)
        if (isAuthEndpoint && typeof console !== 'undefined' && console.log) {
          console.log(`🔐 Supabase auth request: ${urlString.substring(0, 100)}`, {
            hasApikeyHeader: headers.has('apikey'),
            hasApikeyInUrl: typeof finalInput === 'string' ? finalInput.includes('apikey=') : 
                           finalInput instanceof URL ? finalInput.searchParams.has('apikey') : false,
            isAuthorize: isAuthorizeEndpoint,
            isVerify: isVerifyEndpoint,
            isToken: isTokenEndpoint
          });
        }
        
        // When finalInput is a Request object, don't override its headers
        // The Request object already has the merged headers with apikey
        if (finalInput instanceof Request) {
          return fetch(finalInput);
        }
        
        // For string/URL inputs, use the headers we've prepared
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
          // Enable detectSessionInUrl to allow automatic session detection from URL
          // Only enable if we're confident navigation state is ready
          // This prevents "rootState.routeNames is undefined" errors
          detectSessionInUrl: shouldDetectSessionInUrl,
        },
        global: {
          headers: {
            'apikey': supabaseAnonKey
          },
          fetch: customFetch
        }
      });
    } catch (error: any) {
      // If initialization fails due to navigation state error, retry without detectSessionInUrl
      const isNavigationError = error?.message?.includes('routeNames') || 
                                 error?.message?.includes('rootState') ||
                                 error?.message?.includes('navigation');
      
      if (isNavigationError) {
        console.warn('⚠️ Supabase init error (navigation state not ready), retrying without detectSessionInUrl:', error?.message);
      } else {
        console.warn('⚠️ Supabase init error, retrying without detectSessionInUrl:', error);
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
          // Verify endpoints need apikey as query param for custom domains
          const isVerifyEndpoint = urlString.includes('/auth/v1/verify');
          // Token exchange endpoint (for code exchange) needs apikey
          const isTokenEndpoint = urlString.includes('/auth/v1/token');
          
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
            } catch (e) {
              // Ignore URL parsing errors
            }
          }
          
          // Log for debugging auth endpoints (can be removed in production)
          if (isAuthEndpoint && typeof console !== 'undefined' && console.log) {
            console.log(`🔐 Supabase auth request (fallback): ${urlString.substring(0, 100)}`, {
              hasApikeyHeader: headers.has('apikey'),
              hasApikeyInUrl: typeof finalInput === 'string' ? finalInput.includes('apikey=') : 
                             finalInput instanceof URL ? finalInput.searchParams.has('apikey') : false,
              isAuthorize: isAuthorizeEndpoint,
              isVerify: isVerifyEndpoint,
              isToken: isTokenEndpoint
            });
          }
          
          // When finalInput is a Request object, don't override its headers
          // The Request object already has the merged headers with apikey
          if (finalInput instanceof Request) {
            return fetch(finalInput);
          }
          
          // For string/URL inputs, use the headers we've prepared
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
            detectSessionInUrl: true, // Enabled to allow automatic session detection
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
