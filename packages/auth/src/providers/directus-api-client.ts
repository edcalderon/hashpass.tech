/**
 * Small Directus HTTP client used by auth flows to avoid scattered raw fetch calls.
 */

export interface DirectusApiError {
  message: string;
  status?: number;
  code?: string;
}

export interface DirectusApiResult<T> {
  data: T | null;
  error: DirectusApiError | null;
}

interface DirectusErrorPayload {
  errors?: Array<{
    message?: string;
    extensions?: {
      code?: string;
    };
  }>;
  message?: string;
  error?: string;
}

interface DirectusEnvelope<T> extends DirectusErrorPayload {
  data?: T;
}

interface DirectusTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires?: number;
  expires_at?: string;
}

interface DirectusSessionRefreshPayload {
  expires?: number;
}

export class DirectusApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async signInWithPassword(email: string, password: string): Promise<DirectusApiResult<DirectusTokenPayload>> {
    return this.request<DirectusTokenPayload>(
      '/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      },
      'Authentication failed'
    );
  }

  async listAuthProviders(): Promise<DirectusApiResult<Array<{ name?: string }>>> {
    return this.request<Array<{ name?: string }>>('/auth', { method: 'GET' }, 'OAuth provider lookup failed');
  }

  async getCurrentUserWithToken(accessToken: string): Promise<DirectusApiResult<Record<string, any>>> {
    return this.request<Record<string, any>>(
      '/users/me',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      'Failed to fetch user profile'
    );
  }

  async getCurrentUserWithSession(): Promise<DirectusApiResult<Record<string, any>>> {
    return this.request<Record<string, any>>(
      '/users/me',
      {
        method: 'GET',
        credentials: 'include',
      },
      'No active session found'
    );
  }

  async logoutWithToken(accessToken: string): Promise<DirectusApiResult<null>> {
    return this.request<null>(
      '/auth/logout',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      'Token logout failed'
    );
  }

  async logoutSession(): Promise<DirectusApiResult<null>> {
    return this.request<null>(
      '/auth/logout',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'session' }),
      },
      'Session logout failed'
    );
  }

  async refreshToken(refreshToken: string): Promise<DirectusApiResult<DirectusTokenPayload>> {
    return this.request<DirectusTokenPayload>(
      '/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      },
      'Token refresh failed'
    );
  }

  async refreshSessionWithCookies(): Promise<DirectusApiResult<DirectusTokenPayload>> {
    return this.request<DirectusTokenPayload>(
      '/auth/refresh',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'json' }),
      },
      'Session refresh failed'
    );
  }

  async refreshSessionWithSessionCookies(): Promise<DirectusApiResult<DirectusSessionRefreshPayload>> {
    return this.request<DirectusSessionRefreshPayload>(
      '/auth/refresh',
      {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'session' }),
      },
      'Session refresh failed'
    );
  }

  private async request<T>(
    endpoint: string,
    init: RequestInit,
    fallbackError: string
  ): Promise<DirectusApiResult<T>> {
    try {
      const response = await fetch(this.buildUrl(endpoint), init);
      const payload = await this.parsePayload(response);

      if (!response.ok) {
        const parsedError = this.parseError(payload);
        return {
          data: null,
          error: {
            message: parsedError.message || fallbackError,
            code: parsedError.code,
            status: response.status,
          },
        };
      }

      if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
        const envelope = payload as DirectusEnvelope<T>;
        return {
          data: (envelope.data ?? null) as T | null,
          error: null,
        };
      }

      if (payload === null || payload === '' || typeof payload === 'undefined') {
        return { data: null, error: null };
      }

      return { data: payload as T, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Network request failed',
        },
      };
    }
  }

  private buildUrl(endpoint: string): string {
    if (endpoint.startsWith('/')) {
      return `${this.baseUrl}${endpoint}`;
    }
    return `${this.baseUrl}/${endpoint}`;
  }

  private async parsePayload(response: Response): Promise<unknown> {
    if (response.status === 204) {
      return null;
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    try {
      return await response.text();
    } catch {
      return null;
    }
  }

  private parseError(payload: unknown): { message?: string; code?: string } {
    if (!payload || typeof payload !== 'object') {
      return {};
    }

    const typed = payload as DirectusErrorPayload;
    const firstError = typed.errors?.[0];
    const message = firstError?.message || typed.message || typed.error;
    const code = firstError?.extensions?.code;

    return { message, code };
  }
}
