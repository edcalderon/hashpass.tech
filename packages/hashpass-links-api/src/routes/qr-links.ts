import type { SupabaseClient } from '@supabase/supabase-js';
import {
  anonymizeVisitor,
  classifyAgent,
  DEFAULT_QR_VISUAL,
  opaqueToken,
  validateCustomQrSlug,
  validateDestination,
  validateVisualConfig,
  type QrLink,
  type QrLinkCampaign,
  type QrLinkStatus,
  type QrVisualConfig,
} from '@hashpass/backend';
import { adminDb, apiError, authenticatedUser } from '../server';

const STATUSES: QrLinkStatus[] = ['active', 'paused', 'expired', 'archived'];

// Postgres unique_violation. A slug collision is astronomically unlikely
// (opaqueToken(6) is 8 base64url characters, ~2^48 possibilities) but the
// column has a real UNIQUE constraint, so a retry loop is cheap insurance
// against ever surfacing that as a hard failure to an admin creating a link.
const UNIQUE_VIOLATION = '23505';
const SCAN_PAGE_SIZE = 1000;
const REDIRECT_SCAN_LOG_TIMEOUT_MS = 200;

interface QrLinkRow {
  id: string;
  owner_id: string;
  public_slug: string;
  name: string;
  description: string | null;
  destination_url: string;
  campaign_source: string | null;
  campaign_medium: string | null;
  campaign_name: string | null;
  campaign_term: string | null;
  campaign_content: string | null;
  visual_config: QrVisualConfig;
  status: QrLinkStatus;
  starts_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

function toCampaign(row: QrLinkRow): QrLinkCampaign | undefined {
  const campaign: QrLinkCampaign = {
    source: row.campaign_source ?? undefined,
    medium: row.campaign_medium ?? undefined,
    campaign: row.campaign_name ?? undefined,
    term: row.campaign_term ?? undefined,
    content: row.campaign_content ?? undefined,
  };
  const hasAny = Object.values(campaign).some((value) => value !== undefined);
  return hasAny ? campaign : undefined;
}

function toPublic(row: QrLinkRow, scans?: { count: number; lastScanAt?: string }): QrLink {
  const expired = row.status === 'active' && row.expires_at && new Date(row.expires_at) <= new Date();
  return {
    id: row.id,
    ownerId: row.owner_id,
    publicSlug: row.public_slug,
    name: row.name,
    description: row.description ?? undefined,
    destinationUrl: row.destination_url,
    status: expired ? 'expired' : row.status,
    startsAt: row.starts_at ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    visualConfig: row.visual_config,
    campaign: toCampaign(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? undefined,
    scanCount: scans?.count ?? 0,
    lastScanAt: scans?.lastScanAt,
  };
}

function campaignColumns(campaign: QrLinkCampaign | undefined) {
  const c = campaign ?? {};
  return {
    campaign_source: c.source ?? null,
    campaign_medium: c.medium ?? null,
    campaign_name: c.campaign ?? null,
    campaign_term: c.term ?? null,
    campaign_content: c.content ?? null,
  };
}

function availabilityWindow(input: { startsAt?: unknown; expiresAt?: unknown }, existing?: QrLinkRow):
  | { startsAt: string | null; expiresAt: string | null }
  | { error: string } {
  const startsInput = input.startsAt === undefined ? existing?.starts_at ?? null : input.startsAt;
  const expiresInput = input.expiresAt === undefined ? existing?.expires_at ?? null : input.expiresAt;

  const parse = (value: unknown, label: string): string | null | { error: string } => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'string') return { error: `${label} must be a valid date and time` };
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { error: `${label} must be a valid date and time` };
    return date.toISOString();
  };

  const startsAt = parse(startsInput, 'Start time');
  if (startsAt && typeof startsAt === 'object') return startsAt;
  const expiresAt = parse(expiresInput, 'End time');
  if (expiresAt && typeof expiresAt === 'object') return expiresAt;

  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return { error: 'End time must be in the future' };
  }
  if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
    return { error: 'End time must be after the start time' };
  }

  return { startsAt, expiresAt };
}

async function scanCounts(
  db: SupabaseClient,
  qrLinkIds: string[]
): Promise<Record<string, { count: number; lastScanAt?: string }>> {
  if (qrLinkIds.length === 0) return {};

  const result: Record<string, { count: number; lastScanAt?: string }> = {};
  for (let offset = 0; ; offset += SCAN_PAGE_SIZE) {
    const { data, error } = await db
      .from('qr_scan_events')
      .select('qr_link_id, scanned_at')
      .in('qr_link_id', qrLinkIds)
      .range(offset, offset + SCAN_PAGE_SIZE - 1);
    if (error) break;

    const page = (data ?? []) as Array<{ qr_link_id: string; scanned_at: string }>;
    for (const row of page) {
      const entry = result[row.qr_link_id] ?? { count: 0, lastScanAt: undefined };
      entry.count += 1;
      if (!entry.lastScanAt || row.scanned_at > entry.lastScanAt) entry.lastScanAt = row.scanned_at;
      result[row.qr_link_id] = entry;
    }
    if (page.length < SCAN_PAGE_SIZE) break;
  }
  return result;
}

// POST /api/v1/qr-links -- create a new custom QR link, owned by the caller.
export async function createQrLink(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const body = await request.json().catch(() => ({}));

  if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 120) {
    return apiError('A link name (1-120 characters) is required');
  }
  if (body.description !== undefined && body.description !== null) {
    if (typeof body.description !== 'string' || body.description.length > 1000) {
      return apiError('Description must be 1000 characters or fewer');
    }
  }

  let destination: URL;
  try {
    destination = validateDestination(body.destinationUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid destination URL');
  }

  let visualConfig: QrVisualConfig;
  try {
    visualConfig = validateVisualConfig({ ...DEFAULT_QR_VISUAL, ...(body.visualConfig ?? {}) });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid QR visual config');
  }

  const availability = availabilityWindow(body);
  if ('error' in availability) return apiError(availability.error);

  let customSlug: string | null = null;
  if (body.publicSlug !== undefined && body.publicSlug !== null && body.publicSlug !== '') {
    try {
      customSlug = validateCustomQrSlug(body.publicSlug);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid custom link name');
    }
  }

  const db = adminDb();

  for (let attempt = 0; attempt < (customSlug ? 1 : 5); attempt++) {
    const { data, error } = await db
      .from('qr_links')
      .insert({
        owner_id: user.id,
        public_slug: customSlug ?? opaqueToken(6),
        name: body.name.trim(),
        description: body.description ?? null,
        destination_url: destination.toString(),
        visual_config: visualConfig,
        starts_at: availability.startsAt,
        expires_at: availability.expiresAt,
        ...campaignColumns(body.campaign),
      })
      .select('*')
      .single();

    if (!error && data) {
      const row = data as QrLinkRow;
      await db.from('qr_link_audit_events').insert({
        qr_link_id: row.id,
        actor_id: user.id,
        event_type: 'created',
        after_summary: { name: row.name, destinationUrl: row.destination_url, status: row.status },
      });
      return Response.json(toPublic(row), { status: 201, headers: { 'cache-control': 'no-store' } });
    }
    if (error?.code !== UNIQUE_VIOLATION) {
      return apiError('Unable to create QR link', 500);
    }
    if (customSlug) return apiError('This custom link name is already taken', 409);
    // else: slug collision, loop and retry with a freshly generated slug.
  }

  return apiError('Unable to allocate a unique QR link slug, please retry', 500);
}

// GET /api/v1/qr-links -- list every QR link the caller owns, newest first.
export async function listQrLinks(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const db = adminDb();
  const { data, error } = await db
    .from('qr_links')
    .select('*')
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false });
  if (error) return apiError('Unable to list QR links', 500);

  const rows = (data ?? []) as QrLinkRow[];
  const counts = await scanCounts(db, rows.map((row) => row.id));
  return Response.json(
    { links: rows.map((row) => toPublic(row, counts[row.id])) },
    { headers: { 'cache-control': 'no-store' } }
  );
}

// GET /api/v1/qr-links/slug-availability?slug=... -- authenticated preflight
// for the editor. The unique index remains the final authority at save time.
export async function getQrSlugAvailability(request: Request): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const rawSlug = new URL(request.url).searchParams.get('slug');
  let slug: string;
  try {
    slug = validateCustomQrSlug(rawSlug);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid custom link name');
  }

  const { data, error } = await adminDb()
    .from('qr_links')
    .select('id')
    .eq('public_slug', slug)
    .is('deleted_at', null);
  if (error) return apiError('Unable to check custom link name', 500);

  return Response.json({ available: (data as unknown[] | null)?.length === 0, slug }, { headers: { 'cache-control': 'no-store' } });
}

// GET /api/v1/qr-links/:id -- fetch one QR link the caller owns.
export async function getQrLink(request: Request, id: string): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const db = adminDb();
  const { data, error } = await db
    .from('qr_links')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .single();
  if (error || !data) return apiError('QR link not found', 404);

  const row = data as QrLinkRow;
  const counts = await scanCounts(db, [row.id]);
  return Response.json(toPublic(row, counts[row.id]), { headers: { 'cache-control': 'no-store' } });
}

// PATCH /api/v1/qr-links/:id -- edit a QR link's fields, or transition its
// status (active <-> paused, or -> archived) -- the full administration
// lifecycle, all through one endpoint since every field here is optional.
export async function updateQrLink(request: Request, id: string): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const db = adminDb();
  const { data: existingData, error: fetchError } = await db
    .from('qr_links')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .single();
  if (fetchError || !existingData) return apiError('QR link not found', 404);
  const existing = existingData as QrLinkRow;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 1 || body.name.length > 120) {
      return apiError('A link name (1-120 characters) is required');
    }
    patch.name = body.name.trim();
  }
  if (body.publicSlug !== undefined) {
    try {
      patch.public_slug = validateCustomQrSlug(body.publicSlug);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid custom link name');
    }
  }
  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 1000)) {
      return apiError('Description must be 1000 characters or fewer');
    }
    patch.description = body.description;
  }
  if (body.destinationUrl !== undefined) {
    try {
      patch.destination_url = validateDestination(body.destinationUrl).toString();
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid destination URL');
    }
  }
  if (body.visualConfig !== undefined) {
    try {
      patch.visual_config = validateVisualConfig({ ...existing.visual_config, ...body.visualConfig });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Invalid QR visual config');
    }
  }
  if (body.campaign !== undefined) {
    Object.assign(patch, campaignColumns(body.campaign));
  }
  if (body.startsAt !== undefined || body.expiresAt !== undefined) {
    const availability = availabilityWindow(body, existing);
    if ('error' in availability) return apiError(availability.error);
    if (body.startsAt !== undefined) patch.starts_at = availability.startsAt;
    if (body.expiresAt !== undefined) patch.expires_at = availability.expiresAt;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return apiError('Invalid status');
    patch.status = body.status;
    if (body.status === 'archived' && existing.status !== 'archived') {
      patch.archived_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) return apiError('No changes supplied');

  const { data: updatedData, error } = await db
    .from('qr_links')
    .update(patch)
    .eq('id', id)
    .eq('owner_id', user.id)
    .select('*')
    .single();
  if (error?.code === UNIQUE_VIOLATION) return apiError('This custom link name is already taken', 409);
  if (error || !updatedData) return apiError('Unable to update QR link', 500);
  const updated = updatedData as QrLinkRow;

  await db.from('qr_link_audit_events').insert({
    qr_link_id: id,
    actor_id: user.id,
    event_type: 'updated',
    before_summary: { name: existing.name, destinationUrl: existing.destination_url, status: existing.status },
    after_summary: { name: updated.name, destinationUrl: updated.destination_url, status: updated.status },
  });

  return Response.json(toPublic(updated), { headers: { 'cache-control': 'no-store' } });
}

// DELETE /api/v1/qr-links/:id -- an owner-only soft deletion. `deleted_at`
// makes the public redirect, owner list, and analytics routes unavailable
// immediately while retaining a minimal audit trail for accountability.
export async function deleteQrLink(request: Request, id: string): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const db = adminDb();
  const { data: existingData, error: fetchError } = await db
    .from('qr_links')
    .select('*')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .single();
  if (fetchError || !existingData) return apiError('QR link not found', 404);
  const existing = existingData as QrLinkRow;
  const deletedAt = new Date().toISOString();

  const { error } = await db
    .from('qr_links')
    .update({ status: 'archived', archived_at: existing.archived_at ?? deletedAt, deleted_at: deletedAt })
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null);
  if (error) return apiError('Unable to delete QR link', 500);

  await db.from('qr_link_audit_events').insert({
    qr_link_id: id,
    actor_id: user.id,
    event_type: 'deleted',
    before_summary: { name: existing.name, destinationUrl: existing.destination_url, status: existing.status },
    after_summary: { deletedAt },
  });

  return new Response(null, { status: 204 });
}

// GET /api/v1/qr-links/:id/analytics -- scan counts and breakdowns over the
// trailing 30 days for one QR link the caller owns.
export async function getQrLinkAnalytics(request: Request, id: string): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass session required', 401);

  const db = adminDb();
  const { data: link, error: linkError } = await db
    .from('qr_links')
    .select('id')
    .eq('id', id)
    .eq('owner_id', user.id)
    .is('deleted_at', null)
    .single();
  if (linkError || !link) return apiError('QR link not found', 404);

  const windowDays = 30;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const scans: Array<{ scanned_at: string; device_type: string; bot_classification: string }> = [];
  for (let offset = 0; ; offset += SCAN_PAGE_SIZE) {
    const { data, error } = await db
      .from('qr_scan_events')
      .select('scanned_at, device_type, bot_classification')
      .eq('qr_link_id', id)
      .gte('scanned_at', since)
      .order('scanned_at', { ascending: false })
      .range(offset, offset + SCAN_PAGE_SIZE - 1);
    if (error) return apiError('Unable to load QR link analytics', 500);

    const page = (data ?? []) as Array<{ scanned_at: string; device_type: string; bot_classification: string }>;
    scans.push(...page);
    if (page.length < SCAN_PAGE_SIZE) break;
  }
  const scansByDay: Record<string, number> = {};
  const scansByDevice: Record<string, number> = {};
  let botScans = 0;

  for (const scan of scans) {
    const day = scan.scanned_at.slice(0, 10);
    scansByDay[day] = (scansByDay[day] ?? 0) + 1;
    scansByDevice[scan.device_type] = (scansByDevice[scan.device_type] ?? 0) + 1;
    if (scan.bot_classification === 'bot') botScans++;
  }

  return Response.json(
    {
      windowDays,
      totalScans: scans.length,
      humanScans: scans.length - botScans,
      botScans,
      scansByDay,
      scansByDevice,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

/** Invoked by the EventBridge schedule so ended QR links become archived even without a scan. */
export async function archiveExpiredQrLinks(now = new Date()): Promise<number> {
  const db = adminDb();
  const archivedAt = now.toISOString();
  const { data, error } = await db
    .from('qr_links')
    .update({ status: 'archived', archived_at: archivedAt })
    .eq('status', 'active')
    .is('deleted_at', null)
    .lt('expires_at', archivedAt)
    .select('*');
  if (error) throw new Error('Unable to archive expired QR links');

  const rows = (data ?? []) as QrLinkRow[];
  await Promise.all(rows.map((row) => db.from('qr_link_audit_events').insert({
    qr_link_id: row.id,
    actor_id: null,
    event_type: 'expired_archived',
    before_summary: { status: 'active', expiresAt: row.expires_at },
    after_summary: { status: 'archived', archivedAt },
  })));
  return rows.length;
}

async function logScan(db: SupabaseClient, qrLinkId: string, request: Request): Promise<void> {
  const secret = process.env.QR_ANALYTICS_SECRET;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';
  const { bot, device } = classifyAgent(request.headers.get('user-agent') ?? '');

  await db.from('qr_scan_events').insert({
    qr_link_id: qrLinkId,
    // Set explicitly rather than relying on the column's `DEFAULT now()`
    // -- getQrLinkAnalytics() filters on this column with `.gte()`, and an
    // explicit value here means that filter works the same way against
    // both a real Postgres insert and the in-memory fake test client used
    // in src/routes/qr-links.test.ts, which has no notion of column
    // defaults.
    scanned_at: new Date().toISOString(),
    // Falls back to a fixed marker rather than throwing when the secret
    // isn't configured, so a misconfigured analytics secret degrades scan
    // tracking (every scan collapses into one bucket) instead of breaking
    // the redirect itself -- the redirect succeeding is the part real
    // visitors depend on.
    visitor_hash: secret ? anonymizeVisitor(ip, secret) : 'unconfigured',
    device_type: device,
    referrer: request.headers.get('referer') || null,
    country: request.headers.get('cloudfront-viewer-country') || null,
    bot_classification: bot ? 'bot' : 'human',
  });
}

async function logScanWithoutBlockingRedirect(db: SupabaseClient, qrLinkId: string, request: Request): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      logScan(db, qrLinkId, request).catch(() => undefined),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, REDIRECT_SCAN_LOG_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// GET /q/:slug -- the public redirect. No auth: this is what a phone camera
// actually opens when it scans the printed/displayed QR code.
export async function redirectQrLink(request: Request, slug: string): Promise<Response> {
  const db = adminDb();
  const { data } = await db.from('qr_links').select('*').eq('public_slug', slug).is('deleted_at', null).single();
  const link = data as QrLinkRow | null;

  const now = new Date();
  const beforeStart = link?.starts_at ? new Date(link.starts_at) > now : false;
  const expired = link?.expires_at ? new Date(link.expires_at) <= now : false;
  if (!link || link.status !== 'active' || beforeStart || expired) {
    return apiError('This QR link is not available', 404);
  }

  const destination = new URL(link.destination_url);
  if (link.campaign_source) destination.searchParams.set('utm_source', link.campaign_source);
  if (link.campaign_medium) destination.searchParams.set('utm_medium', link.campaign_medium);
  if (link.campaign_name) destination.searchParams.set('utm_campaign', link.campaign_name);
  if (link.campaign_term) destination.searchParams.set('utm_term', link.campaign_term);
  if (link.campaign_content) destination.searchParams.set('utm_content', link.campaign_content);

  // Analytics must not consume the redirect's Lambda timeout. A short,
  // best-effort write keeps normal tracking intact while allowing visitors to
  // proceed even when the analytics datastore is stalled.
  await logScanWithoutBlockingRedirect(db, link.id, request);

  return Response.redirect(destination.toString(), 302);
}
