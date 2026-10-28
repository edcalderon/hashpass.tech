import { getSystemHealthCheck, type HealthCheck } from '@/lib/server/system-health';
import { createCorsPreflightResponse, getCorsHeaders } from '@/lib/cors';

const corsOptions = {
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'Pragma', 'Expires', 'X-Client-Version'],
  maxAge: 86400,
} as const;

const responseHeaders = (request: Request) => {
  return {
    ...getCorsHeaders(request, corsOptions),
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  };
};

export async function OPTIONS(request?: Request) {
  return createCorsPreflightResponse(request, corsOptions);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId') || 'bsl';

  try {
    const healthCheck = await getSystemHealthCheck(eventId);

    return new Response(JSON.stringify(healthCheck, null, 2), {
      status: 200,
      headers: responseHeaders(request),
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
      headers: responseHeaders(request),
    });
  }
}
