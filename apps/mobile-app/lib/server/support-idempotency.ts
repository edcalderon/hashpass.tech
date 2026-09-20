import type { SupabaseClient } from "@supabase/supabase-js";

interface HandlerResult {
  status: number;
  body: unknown;
}

/**
 * Shared Idempotency-Key replay for /v1/support/* mutations (see
 * packages/sdk/src/transport.ts, which sends `idempotency-key` whenever a
 * caller supplies one and allows retries only in that case). A repeat
 * request with the same (appId, route, key) gets back the exact response
 * the first attempt produced instead of re-running the mutation.
 *
 * 5xx responses are deliberately NOT cached: a transient failure should be
 * retryable with the same key rather than permanently pinned to an error.
 */
export async function withIdempotency(
  supabase: SupabaseClient,
  request: Request,
  appId: string,
  route: string,
  handler: () => Promise<HandlerResult>,
): Promise<Response> {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key) {
    const result = await handler();
    return Response.json(result.body, { status: result.status });
  }

  const { data: existing } = await supabase
    .from("support_idempotency_keys")
    .select("response_status, response_body")
    .eq("app_id", appId)
    .eq("route", route)
    .eq("key", key)
    .maybeSingle();

  if (existing) {
    return Response.json(existing.response_body, { status: existing.response_status });
  }

  const result = await handler();

  if (result.status < 500) {
    const { error } = await supabase.from("support_idempotency_keys").insert({
      app_id: appId,
      route,
      key,
      response_status: result.status,
      response_body: result.body as object,
    });
    // 23505 = unique_violation: a concurrent retry already persisted this key
    // first. That request's own response already went out to its caller, so
    // there is nothing to reconcile here -- just don't clobber it.
    if (error && error.code !== "23505") {
      console.warn(`[support-idempotency] failed to persist ${route}:`, error.message);
    }
  }

  return Response.json(result.body, { status: result.status });
}
