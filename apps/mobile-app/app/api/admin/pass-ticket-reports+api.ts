import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Authorization" } });
const STATUSES = new Set(["open", "confirmed", "dismissed"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await authorizeGlobalAdmin(request);
  if ("response" in auth) return auth.response;
  const status = new URL(request.url).searchParams.get("status") || "open";
  if (!STATUSES.has(status)) return json({ error: "Invalid report status" }, 400);

  const { data, error } = await auth.supabase
    .from("external_ticket_reports")
    .select("id,claim_id,reporter_user_id,event_id,issuer,ticket_code_last4,reason,details,status,reviewer_note,created_at,resolved_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("[ticket-report] list failed:", error);
    return json({ error: "Unable to load ticket reports" }, 503);
  }
  const reports = data || [];

  // The reported claimant is the person under suspicion, so the reviewer
  // needs their email next to the reporter's to judge the complaint.
  const claimIds = [...new Set(reports.map((r: { claim_id: string | null }) => r.claim_id).filter(Boolean))] as string[];
  const claimants = new Map<string, { id: string; status: string }>();
  if (claimIds.length) {
    const { data: claims } = await auth.supabase
      .from("external_ticket_claims")
      .select("id,claimant_user_id,status")
      .in("id", claimIds);
    for (const claim of claims || []) claimants.set(claim.id, { id: claim.claimant_user_id, status: claim.status });
  }
  const emails = new Map<string, string | null>();
  const emailFor = async (userId: string) => {
    if (!emails.has(userId)) {
      try {
        const { data: result } = await auth.supabase.auth.admin.getUserById(userId);
        emails.set(userId, result?.user?.email ?? null);
      } catch {
        emails.set(userId, null);
      }
    }
    return emails.get(userId) ?? null;
  };
  const enriched = [];
  for (const report of reports) {
    const claimant = report.claim_id ? claimants.get(report.claim_id) : undefined;
    enriched.push({
      ...report,
      reporter_email: await emailFor(report.reporter_user_id),
      claimant_user_id: claimant?.id ?? null,
      claimant_email: claimant ? await emailFor(claimant.id) : null,
      claim_status: claimant?.status ?? null,
    });
  }
  return json({ data: enriched });
}

export async function POST(request: Request) {
  const auth = await authorizeGlobalAdmin(request);
  if ("response" in auth) return auth.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const reportId = typeof body?.reportId === "string" ? body.reportId.trim() : "";
  const action = typeof body?.action === "string" ? body.action.trim().toLowerCase() : "";
  const note = typeof body?.note === "string" ? body.note.trim().slice(0, 1000) : null;
  if (!UUID.test(reportId)) return json({ error: "A valid report is required" }, 400);
  if (action !== "confirm" && action !== "dismiss") return json({ error: "Unsupported report action" }, 400);

  const { data, error } = await getSupabaseServerForRequest(request).rpc("resolve_external_ticket_report", {
    p_report_id: reportId,
    p_actor_user_id: auth.userId,
    p_action: action,
    p_note: note,
  });
  if (error) {
    console.error("[ticket-report] resolve failed:", error);
    return json({ error: "Unable to resolve the ticket report" }, 503);
  }
  return json({ data });
}
