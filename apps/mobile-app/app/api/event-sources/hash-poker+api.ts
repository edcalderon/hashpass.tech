import {
  getHashPokerEventConfig,
  toHashPokerEventConfig,
  type IngestedEvent,
} from "@hashpass/config/ingested-event-config";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, stale-if-error=3600",
};

export async function GET(request: Request) {
  let data: Array<{ normalized_payload: unknown }> | null = null;
  let error: unknown = null;

  try {
    const supabase = getSupabaseServerForRequest(request);
    const result = await supabase
      .from("published_external_events")
      .select("normalized_payload")
      .eq("source_id", "pkrr-hash-poker")
      .order("last_seen_at", { ascending: false });
    data = result.data as Array<{ normalized_payload: unknown }> | null;
    error = result.error;
  } catch (cause) {
    // A connection-level failure can reject before Supabase returns its usual
    // `{ data, error }` result. Treat it like any other unavailable feed so
    // local callers can still use the bundled snapshot.
    error = cause;
  }

  if (!error && data?.length) {
    const config = toHashPokerEventConfig(
      data.map((row: { normalized_payload: unknown }) =>
        row.normalized_payload,
      ) as IngestedEvent[],
    );
    if (config)
      return Response.json({ data: config, source: "database" }, { headers });
  }

  const hostname = new URL(request.url).hostname;
  const isLocalRequest = hostname === "localhost"
    || hostname === "127.0.0.1"
    || hostname === "::1"
    || hostname === "[::1]";
  const useLegacyFallback = process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK === "true"
    || isLocalRequest;

  if (useLegacyFallback) {
    return Response.json(
      {
        data: getHashPokerEventConfig(),
        source: isLocalRequest ? "local-legacy-fallback" : "legacy-json-fallback",
      },
      {
        headers: {
          ...headers,
          Warning: isLocalRequest
            ? '299 - "Local event snapshot fallback active"'
            : '299 - "Legacy event snapshot fallback active"',
        },
      },
    );
  }

  console.error("Database event feed unavailable", error);
  return Response.json(
    { error: "Event feed unavailable" },
    { status: 503, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}
