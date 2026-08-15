import { isIP } from 'node:net';
import type { QrVisualConfig } from './types';

// Cloud metadata endpoints (AWS/GCP/Azure IMDS) are all served from the
// link-local range (169.254.0.0/16), so they're covered by isPrivateIp
// below without needing a literal metadata IP list. metadata.google.internal
// is the one metadata hostname that resolves outside that range in some
// environments, so it's still blocked explicitly.
const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal']);

export function validateDestination(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('Destination must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS destinations are allowed');
  }
  if (url.username || url.password) {
    throw new Error('Destination credentials are not allowed');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.localhost') || isPrivateIp(host)) {
    throw new Error('Private, local, and metadata destinations are not allowed');
  }

  return url;
}

// Only catches literal IP addresses in the destination (matches this
// service's threat model: the redirect is a client-side 302, the server
// never fetches the destination itself, so this exists to stop obvious
// internal-network open-redirect abuse, not full server-side SSRF). A
// hostname that resolves to a private IP at request time (DNS rebinding)
// is not caught here -- that would only matter for a future feature that
// has the server fetch the destination directly (e.g. link previews).
function isPrivateIp(host: string): boolean {
  if (!isIP(host)) return false;

  if (host.includes(':')) {
    const value = host.toLowerCase();
    return (
      value === '::1' ||
      value === '::' ||
      value.startsWith('fc') ||
      value.startsWith('fd') ||
      value.startsWith('fe8') ||
      value.startsWith('fe9') ||
      value.startsWith('fea') ||
      value.startsWith('feb') ||
      value.startsWith('::ffff:127.') ||
      value.startsWith('::ffff:10.') ||
      value.startsWith('::ffff:169.254.')
    );
  }

  const [a, b] = host.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error('Colors must use six-digit hex notation');
  }

  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function validateVisualConfig(config: QrVisualConfig): QrVisualConfig {
  const foregroundLuminance = luminance(config.foreground);
  const backgroundLuminance = luminance(config.background);
  const contrast =
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);

  if (contrast < 4.5) {
    throw new Error('QR foreground and background need at least 4.5:1 contrast');
  }
  if (config.margin < 4 || config.margin > 16) {
    throw new Error('Quiet zone must be between 4 and 16 modules');
  }
  if (config.logoSize < 10 || config.logoSize > 20) {
    throw new Error('Center logo must occupy 10–20% of the QR');
  }

  // A center logo occludes part of the code, so it always needs the
  // highest error-correction level regardless of what was requested --
  // never let a lower level ship alongside a logo.
  if (config.logo && config.errorCorrection !== 'H') {
    return { ...config, errorCorrection: 'H' };
  }

  return config;
}
