import { authorizeGlobalAdmin } from "@/lib/server/global-admin";
import { serializeSupportTicket } from "@/lib/server/support-serializers";

const TICKET_STATUSES = new Set(["open", "pending", "resolved", "closed"]);

export async function GET(request: Request) {
  const authorization = await authorizeGlobalAdmin(request);
  if ("response" in authorization) return authorization.response;

  const { supabase } = authorization;
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const appId = searchParams.get("appId");
  const cursor = searchParams.get("cursor");
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  if (status && !TICKET_STATUSES.has(status)) {
    return Response.json({ message: "Invalid status" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("list_support_tickets_admin", {
    p_app_id: appId || null,
    p_status: status || null,
    p_cursor: cursor || null,
    p_limit: limit + 1,
  });

  if (error) {
    console.error("[admin/support/tickets] list failed:", error.message);
    return Response.json({ message: "Unable to list tickets" }, { status: 500 });
  }

  const rows: Record<string, unknown>[] = data ?? [];
  const page = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? (page[page.length - 1]?.id as string | undefined) : undefined;

  return Response.json(
    {
      items: page.map((row) => ({ ...serializeSupportTicket(row), appId: row.app_id, needsHuman: row.needs_human })),
      nextCursor,
    },
    { status: 200 },
  );
}
