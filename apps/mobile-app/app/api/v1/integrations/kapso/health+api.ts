import { authorizeGlobalAdmin } from "@/lib/server/global-admin";

export async function GET(request: Request) {
  const authorization = await authorizeGlobalAdmin(request);
  if ("response" in authorization) return authorization.response;

  const { supabase } = authorization;
  const { count, error } = await supabase
    .from("support_kapso_inbound_events")
    .select("id", { count: "exact", head: true })
    .eq("processed", false);

  if (error) {
    console.error("[integrations/kapso/health] count failed:", error.message);
    return Response.json({ message: "Unable to check Kapso health" }, { status: 500 });
  }

  return Response.json(
    {
      webhookSecretConfigured: Boolean(process.env.KAPSO_WEBHOOK_SECRET),
      apiKeyConfigured: Boolean(process.env.KAPSO_API_KEY),
      unprocessedInboundEvents: count ?? 0,
      // No outbound Kapso client exists yet -- see docs/support/architecture.md.
      outboundSendingEnabled: false,
    },
    { status: 200 },
  );
}
