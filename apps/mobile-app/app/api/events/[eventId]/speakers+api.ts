import { getSupabaseServerForRequest } from "@/lib/supabase-server";
import { eventIdFromRequest } from "@/lib/server/event-api";

// Speaker directory access is server-owned so browser clients do not couple to
// the current Supabase schema or credentials.
export async function GET(request: Request) {
  if (!eventIdFromRequest(request)) {
    return Response.json({ error: "A valid event id is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  let query = supabase
    .from("bsl_speakers")
    .select("id, name, title, company, imageurl, user_id, is_active")
    .not("id", "is", null)
    .order("name", { ascending: true });
  if (search) query = query.ilike("name", `%${search.replace(/[%_,]/g, "")}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[event-speakers] collection error:", error);
    return Response.json({ error: "Failed to load speakers" }, { status: 500 });
  }
  return Response.json({ data: data || [] });
}
