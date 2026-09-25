import { sendCriticalNotificationEmail } from "@/lib/email";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES = new Set(["pending", "approved", "rejected"]);
const VALID_DECISIONS = new Set(["approve", "reject"]);

const reviewErrorResponse = (message?: string) => {
  const normalized = message?.toLowerCase() || "";
  if (normalized.includes("not authorized")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (normalized.includes("not found")) {
    return Response.json(
      { error: "Business invitation request not found" },
      { status: 404 },
    );
  }
  if (normalized.includes("invalid") || normalized.includes("unavailable")) {
    return Response.json(
      { error: "Business invitation request cannot be reviewed" },
      { status: 400 },
    );
  }
  return Response.json(
    { error: "Unable to review Business invitation request" },
    { status: 503 },
  );
};

async function resolveApprover(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return {
      response: Response.json(
        { error: identity.error },
        { status: identity.status },
      ),
    } as const;
  }
  if (!identity.supabaseUserId) {
    return {
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }
  return {
    userId: identity.supabaseUserId,
    supabase: getSupabaseServerForRequest(request),
  } as const;
}

/** Lists only the requests the trusted Business approver is allowed to review. */
export async function GET(request: Request) {
  const authorization = await resolveApprover(request);
  if ("response" in authorization) return authorization.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, 100)
      : 100;
  if (!VALID_STATUSES.has(status)) {
    return Response.json(
      { error: "Invalid Business invitation status" },
      { status: 400 },
    );
  }

  const { data, error } = await authorization.supabase.rpc(
    "list_business_invite_requests_for_approver",
    {
      p_actor_user_id: authorization.userId,
      p_status: status,
      p_limit: limit,
    },
  );
  if (error) return reviewErrorResponse(error.message);
  return Response.json({ items: Array.isArray(data) ? data : [] });
}

/** Approves or rejects a single pending request after database-side approver verification. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const requestId = typeof body?.requestId === "string" ? body.requestId : "";
  const decision = typeof body?.decision === "string" ? body.decision : "";
  if (!UUID_RE.test(requestId) || !VALID_DECISIONS.has(decision)) {
    return Response.json(
      { error: "Invalid Business invitation review" },
      { status: 400 },
    );
  }

  const authorization = await resolveApprover(request);
  if ("response" in authorization) return authorization.response;

  const { data, error } = await authorization.supabase.rpc(
    "review_business_invite_request",
    {
      p_request_id: requestId,
      p_actor_user_id: authorization.userId,
      p_decision: decision,
    },
  );
  if (
    error ||
    !data ||
    typeof data.user_id !== "string" ||
    typeof data.status !== "string"
  ) {
    return reviewErrorResponse(error?.message);
  }

  if (
    !data.already_reviewed &&
    (data.status === "approved" || data.status === "rejected")
  ) {
    const approved = data.status === "approved";
    const delivery = await sendCriticalNotificationEmail({
      recipientUserId: data.user_id,
      title: approved
        ? "Business access approved"
        : "Business access request not approved",
      message: approved
        ? "Your BSL and Colombia Blockchain Week Business access is now active."
        : "Your Business access request was reviewed and was not approved.",
      notificationType: approved
        ? "business_invite_approved"
        : "business_invite_rejected",
      actionUrl: "https://hashpass.tech/dashboard/wallet?section=passes",
      actionLabel: "Open passes",
    });
    if (!delivery.success) {
      console.warn(
        "[business-invite] requester review email was not delivered",
      );
    }
  }

  return Response.json(data);
}
