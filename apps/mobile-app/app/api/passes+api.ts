import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";

const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const PASS_TYPES = new Set(["general", "business", "vip"]);
const EVENT_IDS = new Set(["bsl2025", "peru2026", "chile2026", "colombia2026"]);

type PassRow = Record<string, unknown> & {
  id: string;
  event_id: string;
  pass_type?: string | null;
  status?: string | null;
  pass_number?: string | null;
  max_meeting_requests?: number | null;
  used_meeting_requests?: number | null;
  max_boost_amount?: number | null;
  used_boost_amount?: number | null;
  access_features?: string[] | null;
  special_perks?: string[] | null;
};

const numberOr = (value: unknown, fallback: number): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toPassInfo = async (supabase: any, userId: string, pass: PassRow) => {
  const maxRequests = numberOr(pass.max_meeting_requests, 0);
  const usedRequests = numberOr(pass.used_meeting_requests, 0);
  const maxBoost = numberOr(pass.max_boost_amount, 0);
  const usedBoost = numberOr(pass.used_boost_amount, 0);

  let counts: Record<string, unknown> | null = null;
  try {
    const result = await supabase.rpc("get_user_meeting_request_counts", {
      p_user_id: userId,
      p_event_id: pass.event_id,
    });
    if (!result.error) {
      counts =
        (Array.isArray(result.data) ? result.data[0] : result.data) ?? null;
    }
  } catch {
    // The wallet remains usable from the pass row when an older local schema
    // does not expose the event-scoped counter RPC yet.
  }

  const totalRequests = numberOr(counts?.total_requests, usedRequests);
  const remainingRequests = numberOr(
    counts?.remaining_requests,
    Math.max(0, maxRequests - totalRequests),
  );
  const remainingBoost = numberOr(
    counts?.remaining_boost,
    Math.max(0, maxBoost - usedBoost),
  );

  return {
    event_id: pass.event_id,
    pass_id: pass.id,
    pass_type: pass.pass_type || "general",
    status: pass.status || "active",
    pass_number: pass.pass_number || `PASS-${pass.id.slice(-8)}`,
    max_requests: maxRequests,
    used_requests: totalRequests,
    remaining_requests: remainingRequests,
    max_boost: maxBoost,
    used_boost: usedBoost,
    remaining_boost: remainingBoost,
    access_features: pass.access_features || [],
    special_perks: pass.special_perks || [],
  };
};

const validateEventId = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const eventId = value.trim().toLowerCase();
  return EVENT_ID_PATTERN.test(eventId) && EVENT_IDS.has(eventId)
    ? eventId
    : null;
};

async function authenticatedUser(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return {
      response: Response.json(
        { error: identity.error },
        { status: identity.status },
      ),
    };
  }
  if (!identity.supabaseUserId) {
    return {
      response: Response.json(
        { error: "Account is not linked to a pass identity" },
        { status: 403 },
      ),
    };
  }
  return { userId: identity.supabaseUserId };
}

export async function GET(request: Request) {
  const auth = await authenticatedUser(request);
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");
  const eventIds = url.searchParams
    .get("eventIds")
    ?.split(",")
    .map(validateEventId)
    .filter((value): value is string => Boolean(value));
  const supabase = getSupabaseServerForRequest(request);

  try {
    let query = supabase
      .from("passes")
      .select("*")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });

    if (eventId) {
      const validatedEventId = validateEventId(eventId);
      if (!validatedEventId) {
        return Response.json({ error: "Invalid event id" }, { status: 400 });
      }
      query = query.eq("event_id", validatedEventId).eq("status", "active");
    } else if (eventIds?.length) {
      query = query.in("event_id", eventIds).eq("status", "active");
    }

    const { data, error } = await query;
    if (error) throw error;

    const latestByEvent = new Map<string, PassRow>();
    for (const row of (data || []) as PassRow[]) {
      const current = latestByEvent.get(row.event_id);
      if (
        !current ||
        (row.status === "active" && current.status !== "active")
      ) {
        latestByEvent.set(row.event_id, row);
      }
    }

    const passes = await Promise.all(
      Array.from(latestByEvent.values()).map((pass) =>
        toPassInfo(supabase, auth.userId, pass),
      ),
    );
    return Response.json({ data: passes });
  } catch (error) {
    console.error("[passes] fetch error:", error);
    return Response.json({ error: "Failed to load passes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await authenticatedUser(request);
  if ("response" in auth) return auth.response;

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (body?.action !== "create-default") {
    return Response.json(
      { error: "A supported pass action is required" },
      { status: 400 },
    );
  }

  const eventId = validateEventId(body.eventId);
  const passType =
    typeof body.passType === "string" ? body.passType : "general";
  if (!eventId || !PASS_TYPES.has(passType)) {
    return Response.json(
      { error: "A valid eventId and passType are required" },
      { status: 400 },
    );
  }

  try {
    const { data, error } = await getSupabaseServerForRequest(request).rpc(
      "create_default_pass",
      {
        p_user_id: auth.userId,
        p_pass_type: passType,
        p_event_id: eventId,
      },
    );
    if (error) {
      console.error("[passes] default pass creation error:", error);
      return Response.json(
        {
          error:
            "Pass creation is unavailable until the pass schema migration is applied",
        },
        { status: 503 },
      );
    }

    return Response.json(
      { data: { passId: Array.isArray(data) ? data[0] : data } },
      { status: 201 },
    );
  } catch (error) {
    console.error("[passes] default pass creation failed:", error);
    return Response.json(
      {
        error:
          "Pass creation is unavailable until the pass schema migration is applied",
      },
      { status: 503 },
    );
  }
}
