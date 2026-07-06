import { hasDatabaseConnectionString, getDatabasePool } from './database-pool';

const MISSING_DATABASE_CONFIG_MESSAGE =
  'Database is not configured in this environment. Set BETTER_AUTH_DATABASE_URL, BSL_BETTER_AUTH_DATABASE_URL, BSL_DATABASE_URL, DATABASE_URL, SUPABASE_DB_URL_DEV, SUPABASE_DB_URL, or DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD to enable internal status checks.';

const DATABASE_CONNECTION_TIMEOUT_MS = 5000;

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

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

/**
 * Get current system health check.
 * Shared by the status API route and troubleshooting email generation.
 */
export async function getSystemHealthCheck(eventId: string = 'bsl'): Promise<HealthCheck> {
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
    const databaseConfigured = hasDatabaseConnectionString();
    let databaseConfigMissing = false;

    if (!databaseConfigured) {
      databaseConfigMissing = true;
      healthCheck.services.database.status = 'unhealthy';
      healthCheck.services.database.tables.configuration = {
        accessible: false,
        error: MISSING_DATABASE_CONFIG_MESSAGE,
      };
      healthCheck.services.api.status = 'unhealthy';
      healthCheck.services.api.endpoints['/api/status'] = {
        accessible: true,
      };
      healthCheck.services.api.endpoints['/api/bslatam/speakers'] = {
        accessible: false,
        error: MISSING_DATABASE_CONFIG_MESSAGE,
      };
      healthCheck.services.api.endpoints['/api/bslatam/bookings'] = {
        accessible: false,
        error: MISSING_DATABASE_CONFIG_MESSAGE,
      };
      healthCheck.status = 'degraded';
    } else {
      // Check database connectivity and key tables via Postgres so health
      // does not depend on the public Supabase REST key.
      const dbStartTime = Date.now();
      const database = getDatabasePool();
      let databaseResponsive = true;

      try {
        await withTimeout(
          database.query('SELECT 1 AS ok'),
          DATABASE_CONNECTION_TIMEOUT_MS,
          'Database connection timed out'
        );
      } catch (error: any) {
        databaseResponsive = false;
        healthCheck.services.database.status = 'unhealthy';
        healthCheck.services.database.tables.connection = {
          accessible: false,
          error: error?.message || 'Database connection failed',
        };
        healthCheck.services.api.status = 'unhealthy';
        healthCheck.services.api.endpoints['/api/status'] = {
          accessible: true,
        };
        healthCheck.services.api.endpoints['/api/bslatam/speakers'] = {
          accessible: false,
          error: MISSING_DATABASE_CONFIG_MESSAGE,
        };
        healthCheck.services.api.endpoints['/api/bslatam/bookings'] = {
          accessible: false,
          error: MISSING_DATABASE_CONFIG_MESSAGE,
        };
        healthCheck.status = 'degraded';
      }

      const readCount = async (sql: string, params: unknown[] = []) => {
        const result = await database.query(sql, params);
        const rawCount = result.rows[0]?.count;
        return typeof rawCount === 'number' ? rawCount : Number(rawCount || 0);
      };

      const readLatestUpdatedAt = async (sql: string, params: unknown[] = []) => {
        const result = await database.query(sql, params);
        const rawUpdatedAt = result.rows[0]?.updated_at;
        if (!rawUpdatedAt) return null;
        const parsed = new Date(rawUpdatedAt);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      };

      if (databaseResponsive) {
        // 1. Check event_agenda table
        try {
          const latestUpdatedAt = await readLatestUpdatedAt(
            'SELECT updated_at FROM event_agenda WHERE event_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [eventId]
          );
          const agendaCount = await readCount(
            'SELECT COUNT(*)::int AS count FROM event_agenda WHERE event_id = $1',
            [eventId]
          );

          healthCheck.services.database.tables.event_agenda = {
            accessible: true,
            recordCount: agendaCount,
          };
          healthCheck.checks.agenda.hasData = agendaCount > 0;
          healthCheck.checks.agenda.lastUpdated = latestUpdatedAt;
          healthCheck.checks.agenda.itemCount = agendaCount;
        } catch (error: any) {
          healthCheck.services.database.tables.event_agenda = {
            accessible: false,
            error: error?.message || 'Unknown error',
          };
          healthCheck.status = 'degraded';
        }

        // 2. Check bsl_speakers table
        try {
          const speakersCount = await readCount('SELECT COUNT(*)::int AS count FROM bsl_speakers');

          healthCheck.services.database.tables.bsl_speakers = {
            accessible: true,
            recordCount: speakersCount,
          };
          healthCheck.checks.speakers.count = speakersCount;
          healthCheck.checks.speakers.accessible = true;
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
            const bslBookingsCount = await readCount('SELECT COUNT(*)::int AS count FROM "BSL_Bookings"');

            totalBookingsCount += bslBookingsCount;
            healthCheck.services.database.tables.BSL_Bookings = {
              accessible: true,
              recordCount: bslBookingsCount,
            };
          } catch (error: any) {
            bookingErrors.push(`BSL_Bookings: ${error?.message || 'Unknown error'}`);
            healthCheck.services.database.tables.BSL_Bookings = {
              accessible: false,
              error: error?.message || 'Unknown error',
            };
          }

          // Count from meeting_requests table (sent requests)
          try {
            const meetingRequestsCount = await readCount(
              'SELECT COUNT(*)::int AS count FROM meeting_requests'
            );

            totalBookingsCount += meetingRequestsCount;
            healthCheck.services.database.tables.meeting_requests = {
              accessible: true,
              recordCount: meetingRequestsCount,
            };
          } catch (error: any) {
            bookingErrors.push(`meeting_requests: ${error?.message || 'Unknown error'}`);
            healthCheck.services.database.tables.meeting_requests = {
              accessible: false,
              error: error?.message || 'Unknown error',
            };
          }

          // Count from meetings table (accepted meetings)
          try {
            const meetingsCount = await readCount('SELECT COUNT(*)::int AS count FROM meetings');

            totalBookingsCount += meetingsCount;
            healthCheck.services.database.tables.meetings = {
              accessible: true,
              recordCount: meetingsCount,
            };
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
          const passesCount = await readCount(
            'SELECT COUNT(*)::int AS count FROM passes WHERE event_id = $1',
            [eventId]
          );

          healthCheck.services.database.tables.passes = {
            accessible: true,
            recordCount: passesCount,
          };
          healthCheck.checks.passes.count = passesCount;
          healthCheck.checks.passes.accessible = true;
        } catch (error: any) {
          healthCheck.services.database.tables.passes = {
            accessible: false,
            error: error?.message || 'Unknown error',
          };
          healthCheck.checks.passes.accessible = false;
          healthCheck.status = 'degraded';
        }
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
    if (!databaseConfigMissing) {
      healthCheck.services.api.endpoints['/api/bslatam/speakers'] = {
        accessible: true, // Assume accessible if database is working
      };
      healthCheck.services.api.endpoints['/api/bslatam/bookings'] = {
        accessible: true, // Assume accessible if database is working
      };
    }

    // Determine overall status
    if (databaseConfigMissing) {
      healthCheck.status = 'degraded';
    } else if (healthCheck.services.database.status === 'unhealthy') {
      healthCheck.status = 'degraded';
    } else if (
      healthCheck.services.database.status === 'healthy' &&
      healthCheck.services.email.status === 'healthy'
    ) {
      healthCheck.status = 'healthy';
    } else {
      healthCheck.status = 'degraded';
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
