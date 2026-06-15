/**
 * Test endpoint to verify Directus authentication integration
 * GET /api/auth/test - Test authentication status
 */

import { authenticateRequest } from '@hashpass/auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const { user, error } = await authenticateRequest(request);
    
    if (error || !user) {
      return new Response(JSON.stringify({ 
        success: false,
        error: error || 'Authentication required',
        authenticated: false
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        status: user.status
      },
      message: 'Directus authentication working correctly'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Auth test error:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Internal server error',
      authenticated: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  return GET(request);
}