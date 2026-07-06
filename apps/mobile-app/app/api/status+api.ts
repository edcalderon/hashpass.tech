import { getSystemHealthCheck, type HealthCheck } from '@/lib/server/system-health';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cache-Control, Pragma, Expires, X-Client-Version',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId') || 'bsl';

  try {
    const healthCheck = await getSystemHealthCheck(eventId);

    return new Response(JSON.stringify(healthCheck, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });
  } catch (e: any) {
    console.error('Health check API error:', e);
    const errorHealthCheck: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'unhealthy',
          tables: {
            error: {
              accessible: false,
              error: e?.message || 'Unexpected server error',
            },
          },
        },
        email: {
          status: 'not_configured',
          configured: false,
        },
        api: {
          status: 'unhealthy',
          endpoints: {},
        },
      },
      checks: {
        agenda: { hasData: false, lastUpdated: null, itemCount: 0 },
        speakers: { count: 0, accessible: false },
        bookings: { count: 0, accessible: false },
        passes: { count: 0, accessible: false },
      },
    };

    return new Response(JSON.stringify(errorHealthCheck, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });
  }
}
