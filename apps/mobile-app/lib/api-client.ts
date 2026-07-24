/**
 * Event-aware API client for HASHPASS white-label platform
 * Automatically handles event-specific API endpoints and configurations
 */

import React from 'react';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getCurrentEvent } from './event-detector';
import { authService } from '@hashpass/auth';
import { resolvePublicSupabaseConfig } from '../config/supabase-profiles';
import { supabase } from './supabase';

export type ApiResponse<T = any> = {
  data: T;
  error?: never;
  success: true;
} | {
  data?: T | null;
  error: string;
  success: false;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  endpoint?: string;
  params?: Record<string, any>;
  skipEventSegment?: boolean; // Skip event-specific segment for global endpoints
  apiSegment?: string;       // Explicit URL segment override (bypasses getCurrentEvent detection)
  skipAuth?: boolean; // Skip attaching Authorization for public endpoints
  eventId?: string; // Resolve the event by id instead of route/hostname detection —
                     // needed when the calling component isn't rendered on an
                     // event-scoped route (e.g. an event widget on the global home page)
}

const LOCALHOST_API_PATTERN = /^(https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(?:\/|$)/i;
const REMOTE_API_BASE_BY_ENV = {
  development: 'https://api-dev.hashpass.tech/api',
  production: 'https://api.hashpass.tech/api',
} as const;

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/$/, '');

const readBuildEnvironment = (): 'development' | 'production' | null => {
  const candidates = [
    process.env.EXPO_PUBLIC_EAS_BUILD_PROFILE,
    process.env.EAS_BUILD_PROFILE,
    (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_EAS_BUILD_PROFILE,
    (Constants?.expoConfig?.extra as any)?.EAS_BUILD_PROFILE,
    process.env.EXPO_PUBLIC_SUPABASE_PROFILE,
    process.env.SUPABASE_PROFILE,
    (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_SUPABASE_PROFILE,
    (Constants?.expoConfig?.extra as any)?.SUPABASE_PROFILE,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.includes('development') || normalized.includes('preview') || normalized.endsWith('-dev')) {
      return 'development';
    }
    if (normalized.includes('production') || normalized === 'prod' || normalized.endsWith('-prod')) {
      return 'production';
    }
  }

  return null;
};

const resolveFallbackApiBaseUrl = () => {
  const environment = readBuildEnvironment();
  if (environment) {
    return REMOTE_API_BASE_BY_ENV[environment];
  }

  const resolvedEnvironment = resolvePublicSupabaseConfig().environment;
  return resolvedEnvironment === 'development'
    ? REMOTE_API_BASE_BY_ENV.development
    : REMOTE_API_BASE_BY_ENV.production;
};

const resolveWebRuntimeApiBaseUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  const runtime = (window as typeof window & {
    __HASHPASS_RUNTIME__?: { apiBaseUrl?: string };
    __API_BASE_URL__?: string;
  }).__HASHPASS_RUNTIME__;

  const candidates = [
    runtime?.apiBaseUrl,
    (window as typeof window & { __API_BASE_URL__?: string }).__API_BASE_URL__,
  ];

  for (const candidate of candidates) {
    const normalized = normalizeBaseUrl(String(candidate || ''));
    if (normalized) {
      return normalized;
    }
  }

  return null;
};

const resolveRuntimeApiBaseUrl = () => {
  const envBase =
    ((process.env.EXPO_PUBLIC_API_BASE_URL || '') ||
      (Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_API_BASE_URL ||
      '').trim();

  if (!envBase) {
    return resolveWebRuntimeApiBaseUrl() || resolveFallbackApiBaseUrl();
  }

  const normalizedBase = normalizeBaseUrl(envBase);
  const isAbsolute = /^https?:\/\//i.test(normalizedBase);

  if (Platform.OS !== 'web' && (!isAbsolute || LOCALHOST_API_PATTERN.test(normalizedBase))) {
    return resolveFallbackApiBaseUrl();
  }

  return normalizedBase;
};

export const getRuntimeApiBaseUrl = () => resolveRuntimeApiBaseUrl();

/**
 * Returns the Cap widget endpoint for the active API deployment.
 *
 * The web app is served as static assets, so its origin does not host Expo API
 * routes in production. Deriving this from the runtime API base keeps Cap on
 * the same backend as the subscription request while preserving localhost
 * development routing.
 */
export const getCaptchaApiEndpoint = () => `${getRuntimeApiBaseUrl().replace(/\/$/, '')}/captcha/`;

export class EventApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private timeout: number;
  private retries: number;

  /**
   * Extract event-specific API path segment from event config
   * Examples:
   * - '/api/bslatam' -> 'bslatam'
   * - '/api' -> event.id (e.g., 'default')
   */
  private getEventApiSegment(event: ReturnType<typeof getCurrentEvent>): string {
    if (!event) {
      return 'default';
    }

    // Extract segment from basePath if it exists and contains more than just '/api'
    if (event.api?.basePath) {
      const basePath = event.api.basePath.trim();
      // If basePath is '/api/bslatam', extract 'bslatam'
      const match = basePath.match(/^\/api\/(.+)$/);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Fallback to event ID, but use 'default' for default event
    return event.id === 'default' ? 'default' : event.id;
  }

  constructor() {
    const event = getCurrentEvent();
    const resolvedBaseUrl = resolveRuntimeApiBaseUrl();

    if (resolvedBaseUrl) {
      this.baseURL = resolvedBaseUrl.endsWith('/') ? resolvedBaseUrl : `${resolvedBaseUrl}/`;
    } else if (event?.api?.basePath) {
      // Ensure basePath starts with a slash and doesn't end with one
      this.baseURL = event.api.basePath.startsWith('/') 
        ? event.api.basePath 
        : `/${event.api.basePath}`;
      this.baseURL = this.baseURL.endsWith('/') 
        ? this.baseURL.slice(0, -1) 
        : this.baseURL;
    } else {
      // Default to app-local /api
      this.baseURL = '/api';
    }
    
    this.defaultHeaders = {
      'Accept': 'application/json',
    };
    this.timeout = 10000; // 10 seconds
    this.retries = 3;
  }

  /**
   * Make an API request with automatic event endpoint resolution
   */
  async request<T = any>(
    path: string,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    // Get the event configuration. An explicit options.eventId (when the
    // caller isn't on an event-scoped route) takes precedence over
    // route/hostname detection so getEventApiSegment() below doesn't fall
    // back to the 'default' segment, which has no matching API route.
    const event = getCurrentEvent(options.eventId);
    
    // Determine base URL: env/Constants wins, then event config, else constructor default
    const runtimeBaseUrl = resolveRuntimeApiBaseUrl();
    
    let baseUrl: string;
    if (runtimeBaseUrl) {
      if (options.apiSegment) {
        // Caller explicitly knows the correct URL segment — use it directly.
        // Needed when getCurrentEvent() can't detect the event (e.g. native app context).
        baseUrl = `${runtimeBaseUrl}/${options.apiSegment}`;
      } else if (options.skipEventSegment) {
        baseUrl = runtimeBaseUrl;
      } else {
        const eventSegment = this.getEventApiSegment(event);
        baseUrl = `${runtimeBaseUrl}/${eventSegment}`;
      }
    } else {
      if (options.skipEventSegment) {
        baseUrl = '/api';
      } else {
        baseUrl = event?.api?.basePath || this.baseURL;
      }
    }
    
    // Build the final URL
    let url: string;
    
    // If an endpoint is specified in options and exists in the event config
    if (options.endpoint && event?.api?.endpoints?.[options.endpoint]) {
      const endpointPath = event.api.endpoints[options.endpoint];
      const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const cleanPath = endpointPath.startsWith('/') ? endpointPath.slice(1) : endpointPath;
      url = `${cleanBase}/${cleanPath}`;
    } else {
      // Otherwise, build the URL from the base URL and path
      const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      const cleanPath = path.startsWith('/') ? path.slice(1) : path;
      url = `${cleanBase}/${cleanPath}`;
    }
    
    // Add query parameters if provided
    if (options.params) {
      const queryParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      const queryString = queryParams.toString();
      if (queryString) {
        url += (url.includes('?') ? '&' : '?') + queryString;
      }
    }
    
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.timeout,
      retries = this.retries
    } = options;
    
    const requestHeaders = { ...this.defaultHeaders, ...headers };

    // Avoid forcing a preflight on cross-origin GET requests.
    // Only send Content-Type when we are actually sending a JSON body.
    const hasBody = body !== undefined && body !== null;
    const shouldSerializeJson =
      hasBody &&
      typeof body === 'object' &&
      !(typeof FormData !== 'undefined' && body instanceof FormData);

    if (shouldSerializeJson && !requestHeaders['Content-Type'] && method !== 'GET') {
      requestHeaders['Content-Type'] = 'application/json';
    }

    // Add authentication header if available.
    // Supabase JWT is tried first — it is valid on both web and native (OTP, Google OAuth
    // with dual-session bridge). Directus JWT is the fallback for pure Directus sessions.
    if (!options.skipAuth) {
      let authAttached = false;

      try {
        const { data: { session: supabaseSession } } = await supabase.auth.getSession();
        if (supabaseSession?.access_token) {
          requestHeaders['Authorization'] = `Bearer ${supabaseSession.access_token}`;
          authAttached = true;
        }
      } catch { /* ignore — supabase client unavailable */ }

      if (!authAttached) {
        const session = await authService.getSession();
        const isBearerUsableToken =
          !!session?.access_token &&
          session.access_token !== 'session_based' &&
          session.access_token !== 'oauth_session';
        if (isBearerUsableToken) {
          requestHeaders['Authorization'] = `Bearer ${session.access_token}`;
        }
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      let didTimeout = false;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeout);

      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: shouldSerializeJson ? JSON.stringify(body) : hasBody ? body : undefined,
          signal: controller.signal,
          credentials: options.skipAuth ? 'omit' : 'include',
        });

        // Parse response body first (for both success and error cases)
        let data: any;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            data = await response.json();
          } catch (e) {
            // If JSON parsing fails, use empty object
            data = {};
          }
        } else {
          data = {};
        }

        if (!response.ok) {
          // Extract error message from response body if available
          const errorMessage = data?.error || data?.message || `HTTP ${response.status}: ${response.statusText}`;
          const httpError = new Error(errorMessage) as Error & { status?: number };
          httpError.status = response.status;
          throw httpError;
        }

        return {
          data,
          success: true
        };
      } catch (error) {
        if (didTimeout) {
          lastError = new Error('The request timed out. Please try again.');
        } else {
          lastError = error as Error;
        }
        
        // Don't retry on certain errors
        const status = (error as Error & { status?: number })?.status;
        // 4xx client errors (except 408 timeout / 429 rate-limit) won't succeed
        // on retry — the request itself is wrong (bad route, bad params, auth),
        // not a transient failure. Retrying just multiplies load on a 404, etc.
        const isNonRetryableClientError =
          typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
        if (didTimeout || (error instanceof Error && error.name === 'AbortError') || isNonRetryableClientError) {
          break;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return {
      data: null,
      error: lastError?.message || 'Request failed',
      success: false
    };
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  /**
   * POST request
   */
  async post<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  /**
   * PUT request
   */
  async put<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(endpoint: string, body?: any, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(endpoint: string, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }

  /**
   * Upload file
   */
  async upload<T = any>(endpoint: string, file: File, options?: Omit<ApiRequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    const formData = new FormData();
    formData.append('file', file);

    const event = getCurrentEvent();
    const runtimeBaseUrl = resolveRuntimeApiBaseUrl();
    
    let baseUrl: string;
    if (runtimeBaseUrl) {
      // If we have an env base URL (e.g., https://hashpass.co/api/), append event-specific segment
      const eventSegment = this.getEventApiSegment(event);
      baseUrl = `${runtimeBaseUrl}/${eventSegment}`;
    } else {
      // Fallback to event config or constructor default
      baseUrl = event?.api?.basePath || this.baseURL;
    }
    
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${cleanBase}${cleanPath}`;
    const { data: { session } } = await supabase.auth.getSession();
    
    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        data,
        success: true
      };
    } catch (error) {
      return {
        data: null as unknown as T,  // Type assertion to handle generic type with null
        error: (error as Error).message,
        success: false
      };
    }
  }
}

// Global API client instance
export const apiClient = new EventApiClient();

/**
 * Event-specific API methods
 */
export const eventApi = {
  // Speakers API
  speakers: {
    list: () => apiClient.get('/speakers'),
    get: (id: string) => apiClient.get(`/speakers/${id}`),
    create: (data: any) => apiClient.post('/speakers', data),
    update: (id: string, data: any) => apiClient.patch(`/speakers/${id}`, data),
    delete: (id: string) => apiClient.delete(`/speakers/${id}`),
  },

  // Bookings API
  bookings: {
    list: (params?: Record<string, any>) => {
      const query = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiClient.get(`/bookings${query}`);
    },
    get: (id: string) => apiClient.get(`/bookings/${id}`),
    create: (data: any) => apiClient.post('/bookings', data),
    update: (id: string, data: any) => apiClient.patch(`/bookings/${id}`, data),
    delete: (id: string) => apiClient.delete(`/bookings/${id}`),
  },

  // Auto-match API
  autoMatch: {
    find: (data: any) => apiClient.post('/auto-match', data),
  },

  // Ticket verification API
  tickets: {
    verify: (data: any) => apiClient.post('/verify-ticket', data),
  },

  // Analytics API
  analytics: {
    get: (params?: Record<string, any>) => {
      const query = params ? `?${new URLSearchParams(params).toString()}` : '';
      return apiClient.get(`/analytics${query}`);
    },
  },

  // Notifications API
  notifications: {
    list: () => apiClient.get('/notifications'),
    markRead: (id: string) => apiClient.patch(`/notifications/${id}`, { read: true }),
    send: (data: any) => apiClient.post('/notifications', data),
  },
};

/**
 * React hook for API calls
 */
export function useApiCall<T = any>() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const call = React.useCallback(async (
    apiCall: () => Promise<ApiResponse<T>>
  ): Promise<T | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiCall();
      
      if (response.success) {
        return response.data;
      } else {
        setError(response.error || 'API call failed');
        return null;
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading, error };
}

/**
 * React hook for specific API endpoints
 */
export function useEventApi<T = any>(endpoint: string, options?: ApiRequestOptions) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.request<T>(endpoint, options);
      
      if (response.success) {
        setData(response.data);
      } else {
        setError(response.error || 'Request failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(options)]);

  React.useEffect(() => {
    if (options?.method === 'GET' || !options?.method) {
      fetchData();
    }
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
