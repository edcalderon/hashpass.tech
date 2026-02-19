import { createClient } from '@supabase/supabase-js';

// This client is specifically for server-side operations
// Only use this in API routes/server-side code
// DO NOT import this in client-side components - use lib/supabase.ts instead

// Get environment variables (only available at runtime)
const supabaseUrl = typeof process !== 'undefined' ? (process.env.EXPO_PUBLIC_SUPABASE_URL as string) : undefined;
const supabaseServiceKey = typeof process !== 'undefined' ? (process.env.SUPABASE_SERVICE_ROLE_KEY as string) : undefined;

// Lazy initialization - only create client when actually used
let _supabaseServer: ReturnType<typeof createClient> | null = null;

function getSupabaseServer() {
  // Check if we're in a browser/client environment
  const isClient = typeof window !== 'undefined';

  // If we're in client environment, this should not be used
  if (isClient) {
    console.error('⚠️ ERROR: supabase-server.ts is being imported in client-side code!');
    console.error('This file should ONLY be used in server-side API routes.');
    console.error('For client-side code, use lib/supabase.ts instead.');
    throw new Error('supabase-server.ts should only be used in server-side API routes. For client-side code, use lib/supabase.ts instead.');
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = [];
    if (!supabaseUrl) missingVars.push('EXPO_PUBLIC_SUPABASE_URL');
    if (!supabaseServiceKey) missingVars.push('SUPABASE_SERVICE_ROLE_KEY');

    const errorMsg = `Missing Supabase environment variables: ${missingVars.join(', ')}. ` +
      `Please ensure these are set in your production environment. ` +
      `Current values: EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl ? 'SET' : 'MISSING'}, ` +
      `SUPABASE_SERVICE_ROLE_KEY=${supabaseServiceKey ? 'SET' : 'MISSING'}`;

    console.error('❌ Supabase Server Configuration Error:', errorMsg);
    throw new Error(errorMsg);
  }

  if (!_supabaseServer) {
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

    _supabaseServer = createClient(supabaseUrl, supabaseServiceKey, {
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
  }

  return _supabaseServer;
}

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
