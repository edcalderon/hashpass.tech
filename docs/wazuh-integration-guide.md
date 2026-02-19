# Wazuh Integration Guide for HashPass

## Overview

**Wazuh** is an open-source unified XDR (Extended Detection and Response) and SIEM (Security Information and Event Management) platform that provides:
- **Security Monitoring**: Real-time threat detection and incident response
- **Log Management**: Centralized log collection and analysis
- **Compliance**: PCI DSS, HIPAA, GDPR compliance monitoring
- **Vulnerability Detection**: System and application vulnerability scanning
- **Cloud Security**: AWS, Azure, GCP workload protection

This guide outlines how to integrate Wazuh into the HashPass platform to enhance security monitoring, threat detection, and compliance.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    HashPass Application                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Frontend   │  │   API Layer  │  │   Supabase   │     │
│  │  (Expo/Web)  │  │ (Expo Router)│  │  (Postgres)  │     │
│  │              │  │  (Lambda/    │  │              │     │
│  │              │  │   Netlify)   │  │              │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │              │
│         └──────────────────┼─────────────────┘              │
│                              │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Wazuh Agent        │
                    │  (Log Forwarder)     │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Wazuh Manager      │
                    │  (Central Server)    │
                    │  - Log Analysis      │
                    │  - Threat Detection  │
                    │  - Alerting          │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Wazuh Dashboard    │
                    │  (Kibana/OpenSearch) │
                    └──────────────────────┘
```

---

## Integration Approaches

### 1. **Application Log Integration** (Recommended for Web Apps)

Forward application logs, API requests, and security events to Wazuh.

**Use Cases:**
- Monitor authentication attempts (success/failure)
- Track API endpoint access patterns
- Detect suspicious user behavior
- Monitor QR code scan events
- Track admin actions

### 2. **Infrastructure Monitoring**

Monitor AWS infrastructure (Amplify, Lambda, S3, Supabase).

**Use Cases:**
- CloudTrail log analysis
- Lambda function execution monitoring
- S3 bucket access monitoring
- Database connection monitoring

### 3. **Endpoint Protection** (For Servers)

If you have dedicated servers or VMs, install Wazuh agents.

**Use Cases:**
- File integrity monitoring
- System log analysis
- Rootkit detection
- Configuration assessment

---

## Implementation Steps

### Step 1: Set Up Wazuh Infrastructure

#### Option A: Cloud Deployment (Recommended)

1. **Deploy Wazuh Manager on AWS EC2:**
   ```bash
   # Use Wazuh CloudFormation template or deploy manually
   # Minimum requirements: 4GB RAM, 2 CPU cores, 20GB storage
   ```

2. **Or use Wazuh Cloud (SaaS):**
   - Sign up at https://wazuh.com/cloud
   - Get your manager URL and API credentials

#### Option B: Self-Hosted

1. **Install Wazuh Manager:**
   ```bash
   # Ubuntu/Debian
   curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | gpg --dearmor | sudo tee /usr/share/keyrings/wazuh.gpg > /dev/null
   echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee /etc/apt/sources.list.d/wazuh.list
   sudo apt-get update
   sudo apt-get install wazuh-manager
   sudo systemctl daemon-reload
   sudo systemctl enable wazuh-manager
   sudo systemctl start wazuh-manager
   ```

2. **Install Wazuh Dashboard (Kibana/OpenSearch):**
   ```bash
   sudo apt-get install wazuh-dashboard
   sudo systemctl enable wazuh-dashboard
   sudo systemctl start wazuh-dashboard
   ```

### Step 2: Create Wazuh API Integration

Create a library to send security events to Wazuh from your application.

**File: `lib/wazuh-client.ts`**

```typescript
/**
 * Wazuh API Client for HashPass
 * Sends security events and logs to Wazuh Manager
 */

interface WazuhEvent {
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  rule_id?: number;
  location: string;
  user?: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

interface WazuhConfig {
  managerUrl: string;
  apiKey: string;
  agentId?: string;
}

class WazuhClient {
  private config: WazuhConfig;
  private enabled: boolean;

  constructor(config?: Partial<WazuhConfig>) {
    this.config = {
      managerUrl: process.env.WAZUH_MANAGER_URL || '',
      apiKey: process.env.WAZUH_API_KEY || '',
      agentId: process.env.WAZUH_AGENT_ID || 'hashpass-web',
      ...config,
    };
    this.enabled = !!this.config.managerUrl && !!this.config.apiKey;
  }

  /**
   * Send a security event to Wazuh
   */
  async sendEvent(event: WazuhEvent): Promise<void> {
    if (!this.enabled) {
      console.debug('[Wazuh] Client disabled, skipping event');
      return;
    }

    try {
      const wazuhEvent = {
        timestamp: event.timestamp || new Date().toISOString(),
        level: event.level,
        rule: {
          id: event.rule_id || this.getDefaultRuleId(event.level),
          description: event.action,
        },
        location: event.location,
        user: event.user,
        data: {
          action: event.action,
          ...event.details,
        },
        srcip: event.ip_address,
        user_agent: event.user_agent,
      };

      // Send via Wazuh API (vulnerability endpoint or custom integration)
      const response = await fetch(`${this.config.managerUrl}/vulnerability`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent: {
            id: this.config.agentId,
            name: 'hashpass-web',
          },
          vulnerability: {
            name: event.action,
            severity: this.mapLevelToSeverity(event.level),
            description: JSON.stringify(event.details),
            cve: event.rule_id?.toString(),
          },
        }),
      });

      if (!response.ok) {
        console.error('[Wazuh] Failed to send event:', await response.text());
      }
    } catch (error) {
      console.error('[Wazuh] Error sending event:', error);
      // Don't throw - logging failures shouldn't break the app
    }
  }

  /**
   * Log authentication events
   */
  async logAuthEvent(
    action: 'login' | 'logout' | 'login_failed' | 'token_refresh',
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
    details?: Record<string, any>
  ): Promise<void> {
    const level = action.includes('failed') ? 'warning' : 'info';
    await this.sendEvent({
      level,
      location: '/auth',
      user: userId,
      action: `auth_${action}`,
      details: {
        auth_action: action,
        ...details,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * Log API access events
   */
  async logApiAccess(
    endpoint: string,
    method: string,
    userId?: string,
    statusCode: number = 200,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warning' : 'info';
    await this.sendEvent({
      level,
      location: endpoint,
      user: userId,
      action: `api_${method.toLowerCase()}`,
      details: {
        endpoint,
        method,
        status_code: statusCode,
      },
      ip_address: ipAddress,
      user_agent: userAgent,
    });
  }

  /**
   * Log security events (suspicious activity, violations, etc.)
   */
  async logSecurityEvent(
    action: string,
    severity: 'warning' | 'error' | 'critical',
    userId?: string,
    details?: Record<string, any>,
    ipAddress?: string
  ): Promise<void> {
    await this.sendEvent({
      level: severity,
      location: details?.endpoint || 'unknown',
      user: userId,
      action: `security_${action}`,
      details,
      ip_address: ipAddress,
      rule_id: this.getSecurityRuleId(action),
    });
  }

  /**
   * Log QR scan events
   */
  async logQRScan(
    qrCodeId: string,
    status: 'valid' | 'invalid' | 'expired' | 'revoked',
    scannedBy?: string,
    ipAddress?: string
  ): Promise<void> {
    const level = status === 'valid' ? 'info' : 'warning';
    await this.sendEvent({
      level,
      location: '/api/qr/scan',
      user: scannedBy,
      action: 'qr_scan',
      details: {
        qr_code_id: qrCodeId,
        scan_status: status,
      },
      ip_address: ipAddress,
    });
  }

  /**
   * Log admin actions
   */
  async logAdminAction(
    action: string,
    adminId: string,
    targetId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.sendEvent({
      level: 'info',
      location: '/admin',
      user: adminId,
      action: `admin_${action}`,
      details: {
        target_id: targetId,
        ...details,
      },
    });
  }

  private getDefaultRuleId(level: string): number {
    const ruleMap: Record<string, number> = {
      info: 1000,
      warning: 2000,
      error: 3000,
      critical: 4000,
    };
    return ruleMap[level] || 1000;
  }

  private getSecurityRuleId(action: string): number {
    const ruleMap: Record<string, number> = {
      unauthorized_access: 5503,
      brute_force: 5504,
      sql_injection: 5505,
      xss_attempt: 5506,
      rate_limit_exceeded: 5507,
      suspicious_activity: 5508,
    };
    return ruleMap[action] || 5508;
  }

  private mapLevelToSeverity(level: string): string {
    const severityMap: Record<string, string> = {
      info: 'Low',
      warning: 'Medium',
      error: 'High',
      critical: 'Critical',
    };
    return severityMap[level] || 'Low';
  }
}

// Singleton instance
let wazuhClientInstance: WazuhClient | null = null;

export function getWazuhClient(): WazuhClient {
  if (!wazuhClientInstance) {
    wazuhClientInstance = new WazuhClient();
  }
  return wazuhClientInstance;
}

export { WazuhClient, type WazuhEvent };
```

### Step 3: Integrate with API Routes

**File: `lib/api-middleware.ts`** (Already created above)

```typescript
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
```

### Step 4: Add to Authentication Flow

**Update: `app/(shared)/auth.tsx`**

Add Wazuh logging to authentication events. Since this is client-side code, you'll need to call an API endpoint to log events:

```typescript
// In your auth component, after successful login
await fetch('/api/wazuh/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'auth_login',
    userId: user.id,
    level: 'info',
  }),
});

// After failed login
await fetch('/api/wazuh/log', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'auth_login_failed',
    level: 'warning',
    error: error.message,
  }),
});
```

**Or create a helper function in `lib/wazuh-client.ts` for client-side:**

```typescript
// Client-side logging helper (calls API endpoint)
export async function logEventClient(event: {
  action: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  userId?: string;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await fetch('/api/wazuh/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
  } catch (error) {
    console.error('[Wazuh] Failed to log event:', error);
  }
}
```

### Step 5: Add to API Routes (Expo Router)

**Example: Update `app/api/qr/admin/logs+api.ts`**

Expo Router API routes are serverless functions that export HTTP method handlers:

```typescript
import { logApiRequest, logAdminAction } from '@/lib/api-middleware';
import { getWazuhClient } from '@/lib/wazuh-client';

export async function GET(request: Request) {
  const userId = await getAuthUserId(request);
  
  // Log API access
  await logApiRequest(request, userId || undefined, 200);
  
  // ... existing code ...
  
  // Log admin action
  if (isUserAdmin) {
    const wazuh = getWazuhClient();
    await wazuh.logAdminAction('view_qr_logs', userId, undefined, {
      qr_code_id: qrCodeId,
      page,
    });
  }
  
  // ... rest of handler ...
}
```

**Create a Wazuh logging API endpoint: `app/api/wazuh/log+api.ts`**

```typescript
import { getWazuhClient } from '@/lib/wazuh-client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, level, userId, details } = body;
    
    const wazuh = getWazuhClient();
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     undefined;
    const userAgent = request.headers.get('user-agent') || undefined;

    await wazuh.sendEvent({
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
```

### Step 6: Add to QR Scan Events

**Update QR scan handler:**

```typescript
import { getWazuhClient } from '@/lib/wazuh-client';

// After QR scan
const wazuh = getWazuhClient();
await wazuh.logQRScan(
  qrCodeId,
  scanStatus,
  scannedByUserId,
  request.headers.get('x-forwarded-for') || undefined
);
```

### Step 7: Environment Variables

Add to your `.env` file:

```bash
# Wazuh Configuration
WAZUH_MANAGER_URL=https://your-wazuh-manager.com
WAZUH_API_KEY=your-api-key-here
WAZUH_AGENT_ID=hashpass-web
WAZUH_ENABLED=true
```

### Step 8: Wazuh Rules Configuration

Create custom Wazuh rules for HashPass-specific events.

**File: `wazuh/rules/hashpass_rules.xml`**

```xml
<group name="hashpass,">
  <!-- Authentication Events -->
  <rule id="100100" level="5">
    <decoded_as>json</decoded_as>
    <field name="action">auth_login</field>
    <description>HashPass: User login successful</description>
  </rule>

  <rule id="100101" level="10">
    <decoded_as>json</decoded_as>
    <field name="action">auth_login_failed</field>
    <description>HashPass: Failed login attempt</description>
  </rule>

  <rule id="100102" level="12">
    <decoded_as>json</decoded_as>
    <field name="action">auth_login_failed</field>
    <if_matched_sid>100101</if_matched_sid>
    <same_source_ip />
    <frequency>5</frequency>
    <timeframe>300</timeframe>
    <description>HashPass: Multiple failed login attempts (possible brute force)</description>
  </rule>

  <!-- QR Code Events -->
  <rule id="100200" level="5">
    <decoded_as>json</decoded_as>
    <field name="action">qr_scan</field>
    <field name="scan_status">valid</field>
    <description>HashPass: Valid QR code scan</description>
  </rule>

  <rule id="100201" level="8">
    <decoded_as>json</decoded_as>
    <field name="action">qr_scan</field>
    <field name="scan_status">invalid</field>
    <description>HashPass: Invalid QR code scan attempt</description>
  </rule>

  <!-- Admin Actions -->
  <rule id="100300" level="5">
    <decoded_as>json</decoded_as>
    <field name="action">admin_</field>
    <description>HashPass: Admin action performed</description>
  </rule>

  <!-- Security Events -->
  <rule id="100400" level="12">
    <decoded_as>json</decoded_as>
    <field name="action">security_unauthorized_access</field>
    <description>HashPass: Unauthorized access attempt</description>
  </rule>

  <rule id="100401" level="12">
    <decoded_as>json</decoded_as>
    <field name="action">security_rate_limit_exceeded</field>
    <description>HashPass: Rate limit exceeded</description>
  </rule>
</group>
```

### Step 9: Supabase Integration (Optional)

Forward Supabase audit logs to Wazuh using a database trigger or Edge Function.

**Supabase Edge Function: `supabase/functions/wazuh-forwarder/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { table, event, record } = await req.json();

  // Forward to Wazuh
  await fetch(Deno.env.get('WAZUH_MANAGER_URL') + '/vulnerability', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('WAZUH_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent: { id: 'hashpass-supabase', name: 'hashpass-supabase' },
      vulnerability: {
        name: `supabase_${table}_${event}`,
        severity: 'Low',
        description: JSON.stringify(record),
      },
    }),
  });

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### Step 10: AWS CloudTrail Integration

Forward AWS CloudTrail logs to Wazuh for infrastructure monitoring.

**Lambda Function: `aws/lambda/wazuh-cloudtrail-forwarder/index.js`**

```javascript
const https = require('https');
const url = require('url');

exports.handler = async (event) => {
  const wazuhUrl = process.env.WAZUH_MANAGER_URL;
  const wazuhKey = process.env.WAZUH_API_KEY;

  for (const record of event.Records) {
    const cloudTrailEvent = JSON.parse(record.body);
    
    // Forward to Wazuh
    await sendToWazuh(cloudTrailEvent, wazuhUrl, wazuhKey);
  }

  return { statusCode: 200 };
};

async function sendToWazuh(event, wazuhUrl, wazuhKey) {
  // Implementation to send CloudTrail events to Wazuh
  // Use Wazuh AWS integration or custom API
}
```

---

## Monitoring and Alerting

### Key Metrics to Monitor

1. **Authentication Events**
   - Failed login attempts
   - Brute force detection
   - Unusual login patterns

2. **API Security**
   - Rate limit violations
   - Unauthorized access attempts
   - SQL injection attempts
   - XSS attempts

3. **QR Code Security**
   - Invalid scan attempts
   - Expired/revoked code usage
   - Unusual scan patterns

4. **Admin Actions**
   - Privilege escalations
   - Data modifications
   - Configuration changes

### Wazuh Dashboard Views

Create custom dashboards in Wazuh to visualize:
- Real-time security events
- Authentication success/failure rates
- API endpoint access patterns
- Geographic distribution of events
- Top users by activity
- Security event trends

---

## Best Practices

1. **Performance**: Use async logging to avoid blocking requests
2. **Privacy**: Don't log sensitive data (passwords, tokens, PII)
3. **Rate Limiting**: Implement client-side rate limiting for Wazuh API calls
4. **Error Handling**: Ensure Wazuh failures don't break the application
5. **Testing**: Test in development before enabling in production
6. **Compliance**: Ensure logging meets GDPR/privacy requirements

---

## Troubleshooting

### Common Issues

1. **Events not appearing in Wazuh**
   - Check Wazuh API connectivity
   - Verify API key is valid
   - Check Wazuh agent status
   - Review Wazuh manager logs

2. **Performance impact**
   - Use async/await for all Wazuh calls
   - Implement batching for high-volume events
   - Consider using a message queue (Redis/RabbitMQ)

3. **Missing events**
   - Verify environment variables are set
   - Check that Wazuh client is enabled
   - Review application logs for errors

---

## Next Steps

1. **Deploy Wazuh Infrastructure**: Set up Wazuh Manager and Dashboard
2. **Configure Environment**: Add Wazuh environment variables
3. **Implement Logging**: Add Wazuh logging to critical paths
4. **Create Rules**: Define custom Wazuh rules for HashPass events
5. **Set Up Alerts**: Configure email/Slack notifications for critical events
6. **Monitor**: Review Wazuh dashboard regularly
7. **Iterate**: Refine rules and alerts based on observed patterns

---

## Resources

- [Wazuh Documentation](https://documentation.wazuh.com/)
- [Wazuh API Reference](https://documentation.wazuh.com/current/user-manual/api/index.html)
- [Wazuh Rules Documentation](https://documentation.wazuh.com/current/user-manual/ruleset/index.html)
- [Wazuh Cloud](https://wazuh.com/cloud)

---

## Support

For issues or questions:
- Wazuh Community: https://wazuh.com/community
- HashPass GitHub Issues: https://github.com/edcalderon/hashpass.tech/issues

