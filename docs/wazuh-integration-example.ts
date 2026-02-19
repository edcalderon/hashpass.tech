/**
 * Example: How to integrate Wazuh logging into your Expo Router API routes
 * 
 * This file demonstrates how to add Wazuh security logging to your existing API endpoints.
 * 
 * Note: This is an Expo application using Expo Router for API routes.
 * API routes are located in app/api/ and export HTTP method handlers (GET, POST, etc.)
 */

import { logApiRequest, logAuthEvent, logSecurityViolation, logRateLimitViolation } from '@/lib/api-middleware';
import { getWazuhClient } from '@/lib/wazuh-client';

// ============================================================================
// Example 1: Authentication Endpoint
// ============================================================================

export async function POST_login(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // ... authentication logic ...

    // On successful login
    await logAuthEvent('login', user.id, request);

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    // On failed login
    await logAuthEvent('login_failed', undefined, request, error.message);

    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ============================================================================
// Example 2: Protected API Endpoint with Authorization
// ============================================================================

export async function GET_protected(request: Request) {
  const userId = await getAuthUserId(request);

  // Log API access
  await logApiRequest(request, userId || undefined, 200);

  if (!userId) {
    // Log unauthorized access attempt
    await logSecurityViolation(
      'unauthorized_access',
      'warning',
      request,
      undefined,
      { endpoint: '/api/protected', reason: 'Missing authentication' }
    );

    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ... your protected endpoint logic ...

  return new Response(JSON.stringify({ data: 'protected data' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Example 3: Rate Limited Endpoint
// ============================================================================

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const limit = rateLimitMap.get(ip);

  if (!limit || now > limit.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 }); // 1 minute window
    return true;
  }

  if (limit.count >= 10) {
    return false; // Rate limit exceeded
  }

  limit.count++;
  return true;
}

export async function POST_rateLimited(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  const userId = await getAuthUserId(request);

  if (!checkRateLimit(ip)) {
    // Log rate limit violation
    await logRateLimitViolation(request, userId || undefined, '/api/rate-limited');

    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Log successful API access
  await logApiRequest(request, userId || undefined, 200);

  // ... your endpoint logic ...

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Example 4: QR Code Scan Endpoint
// ============================================================================

export async function POST_qrScan(request: Request) {
  const userId = await getAuthUserId(request);
  const body = await request.json();
  const { qrCodeId } = body;

  // Log API access
  await logApiRequest(request, userId || undefined, 200);

  // ... QR validation logic ...
  const scanStatus = validateQRCode(qrCodeId); // 'valid' | 'invalid' | 'expired' | 'revoked'

  // Log QR scan event
  const wazuh = getWazuhClient();
  const ipAddress = request.headers.get('x-forwarded-for') || undefined;
  await wazuh.logQRScan(qrCodeId, scanStatus, userId, ipAddress);

  if (scanStatus !== 'valid') {
    // Log security event for invalid scans
    await logSecurityViolation(
      'invalid_qr_scan',
      'warning',
      request,
      userId,
      { qr_code_id: qrCodeId, scan_status: scanStatus }
    );
  }

  return new Response(JSON.stringify({ status: scanStatus }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Example 5: Admin Action Endpoint
// ============================================================================

export async function POST_adminAction(request: Request) {
  const userId = await getAuthUserId(request);

  if (!userId) {
    await logSecurityViolation(
      'unauthorized_access',
      'warning',
      request,
      undefined,
      { endpoint: '/api/admin', reason: 'Missing authentication' }
    );
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const isAdmin = await checkAdminStatus(userId);
  if (!isAdmin) {
    await logSecurityViolation(
      'unauthorized_access',
      'error',
      request,
      userId,
      { endpoint: '/api/admin', reason: 'Insufficient privileges' }
    );
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const body = await request.json();
  const { action, targetId } = body;

  // Log admin action
  const wazuh = getWazuhClient();
  await wazuh.logAdminAction(action, userId, targetId, {
    endpoint: '/api/admin',
    timestamp: new Date().toISOString(),
  });

  // Log API access
  await logApiRequest(request, userId, 200);

  // ... perform admin action ...

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ============================================================================
// Helper Functions (examples - implement based on your actual code)
// ============================================================================

async function getAuthUserId(request: Request): Promise<string | null> {
  // Your actual auth logic here
  return null;
}

async function checkAdminStatus(userId: string): Promise<boolean> {
  // Your actual admin check logic here
  return false;
}

function validateQRCode(qrCodeId: string): 'valid' | 'invalid' | 'expired' | 'revoked' {
  // Your actual QR validation logic here
  return 'valid';
}

