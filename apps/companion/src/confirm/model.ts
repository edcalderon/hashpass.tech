import type { ConfirmationPayload, ConfirmationResult, InboxInput, InboxItem } from './types.ts';

export const CODE_PATTERN = /^\d{6}$/;
export const CONFIRM_PARAM = 'confirm';

const ERROR_KEYS: Record<string, string> = {
  confirmation_invalid: 'confirm.error.invalid',
  confirmation_locked: 'confirm.error.locked',
  confirmation_rate_limited: 'confirm.error.rateLimited',
  invalid_confirmation_request: 'confirm.error.format',
};

export const errorKeyFor = (serverCode: unknown): string =>
  (typeof serverCode === 'string' && ERROR_KEYS[serverCode]) || 'confirm.error.unavailable';

const normalize = (email: string) => email.trim().toLowerCase();

export const isConfirmed = (confirmedEmails: string[], email: string | null): boolean =>
  email !== null && confirmedEmails.includes(normalize(email));

export const addConfirmed = (confirmedEmails: string[], email: string): string[] => {
  const next = normalize(email);
  return confirmedEmails.includes(next) ? confirmedEmails : [...confirmedEmails, next];
};

export const parseConfirmedEmails = (serialized: string | null): string[] => {
  if (!serialized) return [];
  try {
    const value: unknown = JSON.parse(serialized);
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').map(normalize) : [];
  } catch {
    return [];
  }
};

/** Everything the bell shows. Confirming is optional, so an unconfirmed address is a notice, never a gate. */
export function buildInbox({ ownerEmail, confirmedEmails, linkConfirmedEmail, linkFailed }: InboxInput): InboxItem[] {
  const items: InboxItem[] = [];
  if (linkFailed) items.push({ kind: 'link-invalid' });
  if (linkConfirmedEmail) items.push({ kind: 'email-confirmed', email: linkConfirmedEmail });
  if (ownerEmail && !isConfirmed(confirmedEmails, ownerEmail)) items.push({ kind: 'unconfirmed-email', email: ownerEmail });
  return items;
}

/** The confirm token in a page URL, and the same URL with it removed so a reload does not reuse it. */
export function takeConfirmToken(href: string): { token: string | null; cleanHref: string } {
  const url = new URL(href);
  const token = url.searchParams.get(CONFIRM_PARAM);
  if (token === null) return { token: null, cleanHref: href };
  url.searchParams.delete(CONFIRM_PARAM);
  return { token: token || null, cleanHref: `${url.pathname}${url.search}${url.hash}` };
}

/** `https://api.example/api/auth` -> `https://api.example/api/companion/email-confirm`. */
export const confirmationEndpoint = (authBaseUrl: string): string =>
  `${authBaseUrl.replace(/\/+$/, '').replace(/\/auth$/, '')}/companion/email-confirm`;

export async function callConfirmation(endpoint: string, payload: ConfirmationPayload, fetchImpl: typeof fetch = fetch): Promise<ConfirmationResult> {
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    const body: unknown = await response.json().catch(() => null);
    const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    if (!response.ok) return { ok: false, errorKey: errorKeyFor(record.error) };
    const email = typeof record.email === 'string' ? record.email : payload.action === 'send' || payload.action === 'verify-code' ? payload.email : '';
    return { ok: true, email };
  } catch {
    return { ok: false, errorKey: errorKeyFor(null) };
  }
}
