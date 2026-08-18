import type { QrLink } from '@hashpass-tech/sdk';

export type QrLinkAvailability = 'permanent' | 'expiring' | 'scheduled';

export interface QrLinkFormState {
  name: string;
  publicSlug: string;
  destinationUrl: string;
  description: string;
  campaignSource: string;
  campaignMedium: string;
  campaignName: string;
  availability: QrLinkAvailability;
  startsAt: string;
  expiresAt: string;
}

export interface QrLinkEditSession {
  form: QrLinkFormState;
  campaignOpen: boolean;
  focusEditor: boolean;
}

export interface QrLinkPage<T> {
  currentPage: number;
  pageCount: number;
  items: T[];
}

/** Keeps the QR manager compact while always returning a valid page. */
export function paginateQrLinks<T>(links: T[], requestedPage: number, pageSize = 3): QrLinkPage<T> {
  const pageCount = Math.max(1, Math.ceil(links.length / pageSize));
  const currentPage = Math.min(Math.max(1, requestedPage), pageCount);
  const firstItem = (currentPage - 1) * pageSize;

  return {
    currentPage,
    pageCount,
    items: links.slice(firstItem, firstItem + pageSize),
  };
}

export function deleteConfirmationMatches(value: string): boolean {
  return value.trim().toUpperCase() === 'DELETE';
}

export function beginQrLinkEdit(link: QrLink): QrLinkEditSession {
  return {
    form: {
      name: link.name,
      publicSlug: link.publicSlug,
      destinationUrl: destinationInputFromUrl(link.destinationUrl),
      description: link.description ?? '',
      campaignSource: link.campaign?.source ?? '',
      campaignMedium: link.campaign?.medium ?? '',
      campaignName: link.campaign?.campaign ?? '',
      availability: link.startsAt ? 'scheduled' : link.expiresAt ? 'expiring' : 'permanent',
      startsAt: toDateTimeLocal(link.startsAt ?? (link.expiresAt ? link.createdAt : undefined)),
      expiresAt: toDateTimeLocal(link.expiresAt),
    },
    campaignOpen: Boolean(link.campaign?.source || link.campaign?.medium || link.campaign?.campaign),
    focusEditor: true,
  };
}

function toDateTimeLocal(value: string | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function resolveQrLinkAvailability(
  availability: QrLinkAvailability,
  startsAtInput: string,
  expiresAtInput: string,
): { startsAt: string | null; expiresAt: string | null } {
  if (availability === 'permanent') return { startsAt: null, expiresAt: null };
  if (!expiresAtInput || (availability === 'scheduled' && !startsAtInput)) {
    throw new Error(availability === 'scheduled' ? 'A start and end time are required' : 'An end time is required');
  }

  const startsAt = availability === 'scheduled' ? new Date(startsAtInput) : null;
  const expiresAt = new Date(expiresAtInput);
  if ((startsAt && Number.isNaN(startsAt.getTime())) || Number.isNaN(expiresAt.getTime())) {
    throw new Error('Enter valid start and end times');
  }
  if (expiresAt <= new Date()) throw new Error('End time must be in the future');
  if (startsAt && startsAt >= expiresAt) throw new Error('End time must be after the start time');

  return { startsAt: startsAt?.toISOString() ?? null, expiresAt: expiresAt.toISOString() };
}

/** Converts an existing URL or pasted URL into the editable domain-and-path form. */
export function destinationInputFromUrl(value: string): string {
  const input = value.trim();
  if (!/^https?:\/\//i.test(input)) return input.replace(/^\/\//, '');

  try {
    const url = new URL(input);
    return `${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return input;
  }
}

/** Builds the only destination protocol QR links accept from the domain-only UI. */
export function toHttpsDestination(value: string): string {
  const input = value.trim();
  if (!input || /^https?:\/\//i.test(input) || input.startsWith('//')) {
    throw new Error('Enter a domain and optional path without a protocol');
  }

  let url: URL;
  try {
    url = new URL(`https://${input}`);
  } catch {
    throw new Error('Enter a valid public domain');
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  const isPublicDomain = host.includes('.') && host.length <= 253 && host.split('.').every((label) => (
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
  if (!isPublicDomain || url.username || url.password) throw new Error('Enter a valid public domain');

  return url.toString();
}
