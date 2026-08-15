import { createHmac } from 'node:crypto';

// Rotates monthly so a visitor hash from one month can't be correlated with
// the same visitor's hash the next month, while still letting "unique scans
// this month" be computed as a simple distinct-count. The secret itself
// (QR_ANALYTICS_SECRET) should still be rotated periodically server-side.
export function anonymizeVisitor(ip: string, secret: string, now = new Date()): string {
  if (secret.length < 32) {
    throw new Error('QR analytics secret must be at least 32 characters');
  }

  const rotation = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return createHmac('sha256', secret)
    .update(`${rotation}:${ip}`)
    .digest('base64url')
    .slice(0, 22);
}

export interface AgentClassification {
  bot: boolean;
  device: 'mobile' | 'tablet' | 'desktop' | 'unknown';
}

export function classifyAgent(agent = ''): AgentClassification {
  const bot = /bot|crawler|spider|preview|headless|facebookexternalhit|slurp/i.test(agent);
  const device = /ipad|tablet/i.test(agent)
    ? 'tablet'
    : /mobile|iphone|android/i.test(agent)
      ? 'mobile'
      : agent
        ? 'desktop'
        : 'unknown';

  return { bot, device };
}
