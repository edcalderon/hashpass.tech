/**
 * API Middleware for Wazuh Logging
 * Provides helper functions to log API requests and security events
 */

import { getWazuhClient } from './wazuh-client';

/**
 * Middleware to log API requests to Wazuh
 */
export async function logApiRequest(
  request: Request,
  userId?: string,
  statusCode: number = 200
): Promise<void> {
  const wazuh = getWazuhClient();
  const url = new URL(request.url);
  const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  await wazuh.logApiAccess(
    url.pathname,
    request.method,
    userId,
    statusCode,
    ipAddress,
    userAgent
  );
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  action: 'login' | 'logout' | 'login_failed' | 'token_refresh',
  userId?: string,
  request?: Request,
  error?: string
): Promise<void> {
  const wazuh = getWazuhClient();
  const ipAddress = request?.headers.get('x-forwarded-for') || 'unknown';
  const userAgent = request?.headers.get('user-agent') || 'unknown';

  await wazuh.logAuthEvent(action, userId, ipAddress, userAgent, {
    error,
  });
}

/**
 * Log security violations
 */
export async function logSecurityViolation(
  action: string,
  severity: 'warning' | 'error' | 'critical',
  request: Request,
  userId?: string,
  details?: Record<string, any>
): Promise<void> {
  const wazuh = getWazuhClient();
  const ipAddress = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown';

  await wazuh.logSecurityEvent(action, severity, userId, {
    ...details,
    endpoint: new URL(request.url).pathname,
  }, ipAddress);
}

/**
 * Log rate limit violations
 */
export async function logRateLimitViolation(
  request: Request,
  userId?: string,
  endpoint?: string
): Promise<void> {
  await logSecurityViolation(
    'rate_limit_exceeded',
    'warning',
    request,
    userId,
    { endpoint: endpoint || new URL(request.url).pathname }
  );
}

/**
 * Log unauthorized access attempts
 */
export async function logUnauthorizedAccess(
  request: Request,
  endpoint?: string,
  reason?: string
): Promise<void> {
  await logSecurityViolation(
    'unauthorized_access',
    'warning',
    request,
    undefined,
    {
      endpoint: endpoint || new URL(request.url).pathname,
      reason,
    }
  );
}









