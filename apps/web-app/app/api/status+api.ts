import { supabaseServer as supabase } from '@/lib/supabase-server';

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      tables: {
        [key: string]: {
          accessible: boolean;
          recordCount?: number;
          error?: string;
        };
      };
    };
    email: {
      status: 'healthy' | 'unhealthy' | 'not_configured';
      configured: boolean;
      error?: string;
    };
    api: {
      status: 'healthy' | 'unhealthy';
      endpoints: {
        [key: string]: {
          accessible: boolean;
          error?: string;
        };
      };
    };
  };
  checks: {
    agenda: {
      hasData: boolean;
      lastUpdated: string | null;
      itemCount: number;
    };
    speakers: {
      count: number;
      accessible: boolean;
    };
    bookings: {
      count: number;
      accessible: boolean;
    };
    passes: {
      count: number;
      accessible: boolean;
    };
  };
}

/**
 * Get current system health check
 * This function can be called from API endpoints or email functions
 */
export async function getSystemHealthCheck(eventId: string = 'bsl2025'): Promise<HealthCheck> {
  const healthCheck: HealthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: 'healthy',
        tables: {},
      },
      email: {
        status: 'not_configured',
        configured: false,
      },
      api: {
        status: 'healthy',
        endpoints: {},
      },
    },
    checks: {
      agenda: {
        hasData: false,
        lastUpdated: null,
        itemCount: 0,
      },
      speakers: {
        count: 0,
        accessible: false,
      },
      bookings: {
        count: 0,
        accessible: false,
      },
      passes: {
        count: 0,
        accessible: false,
      },
    },
  };

  try {
    // Check database connectivity and key tables
    const dbStartTime = Date.now();
    
    // 1. Check event_agenda table
    try {
      const { data: latestUpdate, error: agendaError } = await supabase
        .from('event_agenda')
        .select('updated_at')
        .eq('event_id', eventId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { count: agendaCount, error: countError } = await supabase
        .from('event_agenda')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);

      if (agendaError || countError) {
        healthCheck.services.database.tables.event_agenda = {
          accessible: false,
          error: agendaError?.message || countError?.message,
        };
        healthCheck.checks.agenda.hasData = false;
        healthCheck.status = 'degraded';
      } else {
        healthCheck.services.database.tables.event_agenda = {
          accessible: true,
          recordCount: agendaCount || 0,
        };
        healthCheck.checks.agenda.hasData = (agendaCount || 0) > 0;
        healthCheck.checks.agenda.lastUpdated = latestUpdate?.updated_at || null;
        healthCheck.checks.agenda.itemCount = agendaCount || 0;
      }
    } catch (error: any) {
      healthCheck.services.database.tables.event_agenda = {
        accessible: false,
        error: error?.message || 'Unknown error',
      };
      healthCheck.status = 'degraded';
    }

    // 2. Check bsl_speakers table
    try {
      const { count: speakersCount, error: speakersError } = await supabase
        .from('bsl_speakers')
        .select('id', { count: 'exact', head: true });

      if (speakersError) {
        healthCheck.services.database.tables.bsl_speakers = {
          accessible: false,
          error: speakersError.message,
        };
        healthCheck.checks.speakers.accessible = false;
        healthCheck.status = 'degraded';
      } else {
        healthCheck.services.database.tables.bsl_speakers = {
          accessible: true,
          recordCount: speakersCount || 0,
        };
        healthCheck.checks.speakers.count = speakersCount || 0;
        healthCheck.checks.speakers.accessible = true;
      }
    } catch (error: any) {
      healthCheck.services.database.tables.bsl_speakers = {
        accessible: false,
        error: error?.message || 'Unknown error',
      };
      healthCheck.checks.speakers.accessible = false;
      healthCheck.status = 'degraded';
    }

    // 3. Check bookings - count from BSL_Bookings, meeting_requests, and meetings tables
    try {
      let totalBookingsCount = 0;
      let bookingsAccessible = true;
      const bookingErrors: string[] = [];

      // Count from BSL_Bookings table
      try {
        const { count: bslBookingsCount, error: bslBookingsError } = await supabase
          .from('BSL_Bookings')
          .select('id', { count: 'exact', head: true });

        if (bslBookingsError) {
          bookingErrors.push(`BSL_Bookings: ${bslBookingsError.message}`);
          healthCheck.services.database.tables.BSL_Bookings = {
            accessible: false,
            error: bslBookingsError.message,
          };
        } else {
          totalBookingsCount += bslBookingsCount || 0;
          healthCheck.services.database.tables.BSL_Bookings = {
            accessible: true,
            recordCount: bslBookingsCount || 0,
          };
        }
      } catch (error: any) {
        bookingErrors.push(`BSL_Bookings: ${error?.message || 'Unknown error'}`);
        healthCheck.services.database.tables.BSL_Bookings = {
          accessible: false,
          error: error?.message || 'Unknown error',
        };
      }

      // Count from meeting_requests table (sent requests)
      try {
        const { count: meetingRequestsCount, error: meetingRequestsError } = await supabase
          .from('meeting_requests')
          .select('id', { count: 'exact', head: true });

        if (meetingRequestsError) {
          bookingErrors.push(`meeting_requests: ${meetingRequestsError.message}`);
          healthCheck.services.database.tables.meeting_requests = {
            accessible: false,
            error: meetingRequestsError.message,
          };
        } else {
          totalBookingsCount += meetingRequestsCount || 0;
          healthCheck.services.database.tables.meeting_requests = {
            accessible: true,
            recordCount: meetingRequestsCount || 0,
          };
        }
      } catch (error: any) {
        bookingErrors.push(`meeting_requests: ${error?.message || 'Unknown error'}`);
        healthCheck.services.database.tables.meeting_requests = {
          accessible: false,
          error: error?.message || 'Unknown error',
        };
      }

      // Count from meetings table (accepted meetings)
      try {
        const { count: meetingsCount, error: meetingsError } = await supabase
          .from('meetings')
          .select('id', { count: 'exact', head: true });

        if (meetingsError) {
          bookingErrors.push(`meetings: ${meetingsError.message}`);
          healthCheck.services.database.tables.meetings = {
            accessible: false,
            error: meetingsError.message,
          };
        } else {
          totalBookingsCount += meetingsCount || 0;
          healthCheck.services.database.tables.meetings = {
            accessible: true,
            recordCount: meetingsCount || 0,
          };
        }
      } catch (error: any) {
        bookingErrors.push(`meetings: ${error?.message || 'Unknown error'}`);
        healthCheck.services.database.tables.meetings = {
          accessible: false,
          error: error?.message || 'Unknown error',
        };
      }

      // Set bookings check status
      if (bookingErrors.length > 0) {
        bookingsAccessible = false;
        healthCheck.status = 'degraded';
      }

      healthCheck.checks.bookings.count = totalBookingsCount;
      healthCheck.checks.bookings.accessible = bookingsAccessible;
    } catch (error: any) {
      healthCheck.services.database.tables.BSL_Bookings = {
        accessible: false,
        error: error?.message || 'Unknown error',
      };
      healthCheck.checks.bookings.accessible = false;
      healthCheck.status = 'degraded';
    }

    // 4. Check passes table
    try {
      const { count: passesCount, error: passesError } = await supabase
        .from('passes')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId);

      if (passesError) {
        healthCheck.services.database.tables.passes = {
          accessible: false,
          error: passesError.message,
        };
        healthCheck.checks.passes.accessible = false;
        healthCheck.status = 'degraded';
      } else {
        healthCheck.services.database.tables.passes = {
          accessible: true,
          recordCount: passesCount || 0,
        };
        healthCheck.checks.passes.count = passesCount || 0;
        healthCheck.checks.passes.accessible = true;
      }
    } catch (error: any) {
      healthCheck.services.database.tables.passes = {
        accessible: false,
        error: error?.message || 'Unknown error',
      };
      healthCheck.checks.passes.accessible = false;
      healthCheck.status = 'degraded';
    }

    // Calculate database response time
    const dbResponseTime = Date.now() - dbStartTime;
    healthCheck.services.database.responseTime = dbResponseTime;

    // Check if database is overall healthy
    const allTablesAccessible = Object.values(healthCheck.services.database.tables).every(
      (table) => table.accessible
    );
    if (!allTablesAccessible) {
      healthCheck.services.database.status = 'unhealthy';
      if (healthCheck.status === 'healthy') {
        healthCheck.status = 'degraded';
      }
    }

    // Check email service configuration
    const emailEnabled =
      process.env.NODEMAILER_HOST &&
      process.env.NODEMAILER_PORT &&
      process.env.NODEMAILER_USER &&
      process.env.NODEMAILER_PASS &&
      process.env.NODEMAILER_FROM;

    if (emailEnabled) {
      healthCheck.services.email.configured = true;
      healthCheck.services.email.status = 'healthy';
      // Note: We don't actually test sending an email here to avoid spam
      // Just check if configuration exists
    } else {
      healthCheck.services.email.configured = false;
      healthCheck.services.email.status = 'not_configured';
    }

    // Check API endpoints (basic connectivity check)
    // We'll mark them as accessible if we got this far
    healthCheck.services.api.endpoints['/api/status'] = {
      accessible: true,
    };
    healthCheck.services.api.endpoints['/api/bslatam/speakers'] = {
      accessible: true, // Assume accessible if database is working
    };
    healthCheck.services.api.endpoints['/api/bslatam/bookings'] = {
      accessible: true, // Assume accessible if database is working
    };

    // Determine overall status
    if (healthCheck.services.database.status === 'unhealthy') {
      healthCheck.status = 'unhealthy';
    } else if (
      healthCheck.services.database.status === 'healthy' &&
      healthCheck.services.email.status === 'healthy'
    ) {
      healthCheck.status = 'healthy';
    }

    return healthCheck;
  } catch (e: any) {
    console.error('Health check error:', e);
    healthCheck.status = 'unhealthy';
    healthCheck.services.database.status = 'unhealthy';
    healthCheck.services.database.tables = {
      error: {
        accessible: false,
        error: e?.message || 'Unexpected server error',
      },
    };
    return healthCheck;
  }
}

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
  const eventId = searchParams.get('eventId') || 'bsl2025';

  try {
    const healthCheck = await getSystemHealthCheck(eventId);
    
    // Set HTTP status code based on health
    const httpStatus =
      healthCheck.status === 'healthy' ? 200 : healthCheck.status === 'degraded' ? 200 : 503;

    return new Response(JSON.stringify(healthCheck, null, 2), {
      status: httpStatus,
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
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });
  }
}
