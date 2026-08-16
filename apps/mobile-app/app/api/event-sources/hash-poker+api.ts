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
  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase
    .from("published_external_events")
    .select("normalized_payload")
    .eq("source_id", "pkrr-hash-poker")
    .order("last_seen_at", { ascending: false });

  if (!error && data?.length) {
    const config = toHashPokerEventConfig(
      data.map((row: { normalized_payload: unknown }) =>
        row.normalized_payload,
      ) as IngestedEvent[],
    );
    if (config)
      return Response.json({ data: config, source: "database" }, { headers });
  }

  if (process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK === "true") {
    return Response.json(
      { data: getHashPokerEventConfig(), source: "legacy-json-fallback" },
      {
        headers: {
          ...headers,
          Warning: '299 - "Legacy event snapshot fallback active"',
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
