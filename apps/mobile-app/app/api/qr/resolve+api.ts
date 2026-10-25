import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { rateLimitOk } from "@/lib/bsl/rateLimit";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import type {
  HashpassQrKind,
  HashpassQrResolution,
  ParsedHashpassQrPayload,
  ResolvedQrRecord,
} from "@/types/qr-payload.types";
import type { PassRecord } from "@/types/qr-api.types";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const SAFE_KINDS = new Set<HashpassQrKind>([
  "qr_token",
  "hpass_id",
  "pass_id",
  "wallet",
  "network",
  "url",
]);

const asString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
};

const asNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const normalizePayload = (body: Record<string, unknown>): ParsedHashpassQrPayload | null => {
  const kind = asString(body.kind) as HashpassQrKind | undefined;
  if (!kind || !SAFE_KINDS.has(kind)) return null;
  return {
    kind,
    raw: asString(body.raw) || "",
    token: asString(body.token),
    hpassId: asString(body.hpassId),
    passId: asString(body.passId),
    userId: asString(body.userId),
    eventId: asString(body.eventId)?.toLowerCase(),
    network: asString(body.network),
    address: asString(body.address),
    label: asString(body.label),
    isValid: true,
  };
};

const passFields = "id,user_id,event_id,pass_type,status,pass_number,max_meeting_requests,used_meeting_requests,max_boost_amount,used_boost_amount,created_at,updated_at";

async function findPass(supabase: any, payload: ParsedHashpassQrPayload): Promise<PassRecord | null> {
  const candidates: [string, string | undefined][] = [
    ...(payload.passId ? [["id", payload.passId], ["pass_number", payload.passId]] as [string, string][] : []),
    ...(payload.hpassId ? [["pass_number", payload.hpassId], ["user_id", payload.hpassId]] as [string, string][] : []),
    ...(payload.userId ? [["user_id", payload.userId]] as [string, string][] : []),
  ];
  for (const [column, value] of candidates) {
    if (!value) continue;
    let query = supabase
      .from("passes")
      .select(passFields)
      .eq(column, value);
    // A user can have one pass per event. Scope user-based lookups before
    // ordering so a newer pass from another event cannot mask a valid match.
    if (column === "user_id" && payload.eventId) {
      query = query.eq("event_id", payload.eventId);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) return data as PassRecord;
  }
  return null;
}

async function findProfile(supabase: any, userId: string) {
  const lookups = [
    ["user_profiles", "user_id", "user_id,full_name,display_name"] as const,
    ["users", "id", "id,full_name,first_name,last_name"] as const,
    ["user", "id", "id,full_name,first_name,last_name"] as const,
  ];
  for (const [table, column, fields] of lookups) {
    const { data, error } = await supabase
      .from(table)
      .select(fields)
      .eq(column, userId)
      .maybeSingle();
    if (!error && data) {
      const name = data.full_name || data.display_name ||
        [data.first_name, data.last_name].filter(Boolean).join(" ") || null;
      return {
        id: userId,
        name,
        username: null,
      };
    }
  }
  return { id: userId, name: null, username: null };
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimitOk(`qr-resolve:${ip}`)) {
    return Response.json({ error: "Too many QR resolution requests" }, { status: 429 });
  }

  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return Response.json({ error: identity.error }, { status: identity.status });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A JSON body is required" }, { status: 400 });
  }

  const payload = normalizePayload(body);
  if (!payload) return Response.json({ error: "Unsupported QR payload" }, { status: 400 });
  if (payload.eventId && !EVENT_ID_PATTERN.test(payload.eventId)) {
    return Response.json({ error: "Invalid event id" }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  if (payload.kind === "wallet" || payload.kind === "network") {
    const response: HashpassQrResolution = {
      valid: Boolean(payload.address || payload.network),
      kind: payload.kind,
      message: payload.address || payload.network ? "Network QR recognized" : "Network QR is incomplete",
      eventId: payload.eventId,
      network: payload.network,
      address: payload.address,
    };
    return Response.json(response);
  }

  let lookupPayload = payload;
  let qr: ResolvedQrRecord | null = null;
  if (payload.kind === "qr_token" && payload.token) {
    const qrResult = await supabase
      .from("qr_codes")
      .select("id,qr_type,pass_id,display_data,status,expires_at")
      .eq("token", payload.token)
      .maybeSingle();
    if (qrResult.error || !qrResult.data) {
      return Response.json({
        valid: false,
        kind: payload.kind,
        message: "QR code not found",
        eventId: payload.eventId,
      } satisfies HashpassQrResolution, { status: 404 });
    }
    const qrRecord = qrResult.data as ResolvedQrRecord;
    qr = qrRecord;
    const displayEvent = typeof qrRecord.display_data?.event_id === "string"
      ? qrRecord.display_data.event_id
      : typeof qrRecord.display_data?.eventId === "string"
        ? qrRecord.display_data.eventId
        : undefined;
    lookupPayload = {
      ...payload,
      passId: payload.passId || qrRecord.pass_id || undefined,
      eventId: payload.eventId || displayEvent,
    };
  }

  const pass = await findPass(supabase, lookupPayload);
  if (!pass) {
    if (payload.kind === "hpass_id" && payload.hpassId) {
      const user = await findProfile(supabase, payload.hpassId);
      if (user.name || user.username) {
        return Response.json({
          valid: true,
          kind: payload.kind,
          message: "HashPass user identified",
          eventId: payload.eventId,
          user,
        } satisfies HashpassQrResolution);
      }
    }
    const response: HashpassQrResolution = {
      valid: false,
      kind: payload.kind,
      message: qr ? "QR code is not linked to an available pass" : "No HashPass user or pass matched this QR code",
      eventId: lookupPayload.eventId,
      qr: qr ? { id: qr.id, type: qr.qr_type || null, status: qr.status || null, expiresAt: qr.expires_at || null } : undefined,
    };
    return Response.json(response, { status: 404 });
  }
  if (payload.eventId && payload.eventId !== pass.event_id) {
    return Response.json({
      valid: false,
      kind: payload.kind,
      message: "The pass belongs to a different event",
      eventId: pass.event_id,
    } satisfies HashpassQrResolution, { status: 409 });
  }

  const user = await findProfile(supabase, pass.user_id);
  const qrExpired = Boolean(qr?.expires_at && Date.parse(qr.expires_at) < Date.now());
  const qrUsable = !qr || (qr.status === "active" && !qrExpired);
  const response: HashpassQrResolution = {
    valid: pass.status === "active" && qrUsable,
    kind: payload.kind,
    message: !qrUsable
      ? `QR code is ${qrExpired ? "expired" : qr?.status || "unavailable"}`
      : pass.status === "active" ? "HashPass pass is valid" : `HashPass pass is ${pass.status || "unavailable"}`,
    eventId: pass.event_id,
    qr: qr ? { id: qr.id, type: qr.qr_type || null, status: qr.status || null, expiresAt: qr.expires_at || null } : undefined,
    user,
    pass: {
      id: pass.id,
      number: pass.pass_number,
      type: pass.pass_type,
      status: pass.status,
      eventId: pass.event_id,
      createdAt: pass.created_at,
      updatedAt: pass.updated_at,
      requests: { used: asNumber(pass.used_meeting_requests), max: asNumber(pass.max_meeting_requests) },
      boost: { used: asNumber(pass.used_boost_amount), max: asNumber(pass.max_boost_amount) },
    },
  };
  return Response.json(response);
}
