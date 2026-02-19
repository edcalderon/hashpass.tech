/**
 * Wazuh Logging API Endpoint
 * 
 * This endpoint allows client-side code to log security events to Wazuh
 * through a server-side API route (Expo Router).
 * 
 * Usage from client:
 *   await fetch('/api/wazuh/log', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({
 *       action: 'auth_login',
 *       level: 'info',
 *       userId: 'user-id',
 *       details: { ... }
 *     })
 *   });
 */

import { getWazuhClient } from '@/lib/wazuh-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, level, userId, details } = body;
    
    if (!action) {
      return new Response(JSON.stringify({ error: 'Action is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const wazuh = getWazuhClient();
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    await wazuh.sendEvent({
      timestamp: new Date().toISOString(),
      level: level || 'info',
      location: '/api/wazuh/log',
      user: userId,
      action,
      details: details || {},
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('[Wazuh] Log endpoint error:', error);
    return new Response(JSON.stringify({ error: 'Failed to log event' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

