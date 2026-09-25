import type { SupabaseClient } from "@supabase/supabase-js";

interface HandlerResult {
  status: number;
  body: unknown;
}

async function readReplay(
  supabase: SupabaseClient,
  appId: string,
  visitorId: string,
  route: string,
  key: string,
) {
  return supabase
    .from("support_idempotency_keys")
    .select("response_status, response_body")
    .eq("app_id", appId)
    .eq("visitor_id", visitorId)
    .eq("route", route)
    .eq("key", key)
    .maybeSingle();
}

function matchKey(
  query: any,
  appId: string,
  visitorId: string,
  route: string,
  key: string,
) {
  return query
    .eq("app_id", appId)
    .eq("visitor_id", visitorId)
    .eq("route", route)
    .eq("key", key);
}

/**
 * Atomically claims an Idempotency-Key before running a mutation. A concurrent
 * request can never execute the handler: the primary key insert either wins or
 * returns 23505. Status 0 is a short-lived in-progress claim; clients retry it.
 */
export async function withIdempotency(
  supabase: SupabaseClient,
  request: Request,
  appId: string,
  visitorId: string,
  route: string,
  handler: () => Promise<HandlerResult>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) {
    const result = await handler();
    return Response.json(result.body, { status: result.status });
  }

  const { error: claimError } = await supabase
    .from("support_idempotency_keys")
    .insert({
      app_id: appId,
      visitor_id: visitorId,
      route,
      key,
      response_status: 0,
      response_body: null,
    });

  if (claimError) {
    if (claimError.code !== "23505") {
      console.warn(
        `[support-idempotency] failed to claim ${route}:`,
        claimError.message,
      );
      return Response.json(
        { message: "Unable to reserve idempotency key" },
        { status: 503 },
      );
    }
    const { data: existing, error } = await readReplay(
      supabase,
      appId,
      visitorId,
      route,
      key,
    );
    if (error || !existing || existing.response_status === 0) {
      return Response.json(
        { message: "Request with this idempotency key is still processing" },
        { status: 409, headers: { "retry-after": "1" } },
      );
    }
    return Response.json(existing.response_body, {
      status: existing.response_status,
    });
  }

  try {
    const result = await handler();
    if (result.status >= 500) {
      await matchKey(
        supabase.from("support_idempotency_keys").delete(),
        appId,
        visitorId,
        route,
        key,
      );
      return Response.json(result.body, { status: result.status });
    }
    const { error } = await matchKey(
      supabase
        .from("support_idempotency_keys")
        .update({
          response_status: result.status,
          response_body: result.body as object,
        }),
        appId,
        visitorId,
        route,
        key,
      );
    if (error)
      console.warn(
        `[support-idempotency] failed to finalize ${route}:`,
        error.message,
      );
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    await matchKey(
      supabase.from("support_idempotency_keys").delete(),
      appId,
      visitorId,
      route,
      key,
    );
    throw error;
  }
}
