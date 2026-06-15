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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
      level: severity,
      location: details?.endpoint || 'unknown',
      user: userId,
      action: `security_${action}`,
      details: details || {},
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
      timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
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

/**
 * Client-side logging helper (calls API endpoint)
 * Use this from client-side code (React components, etc.)
 */
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
    // Don't throw - logging failures shouldn't break the app
  }
}

export { WazuhClient, type WazuhEvent };

