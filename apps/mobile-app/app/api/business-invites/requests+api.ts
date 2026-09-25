import { sendCriticalNotificationEmail } from "@/lib/email";
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from "@/lib/server/resolve-notification-identity";
import { getSupabaseServerForRequest } from "@/lib/supabase-server";

const normalizeInviteCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(code) ? code : null;
};

type BusinessInviteRequest = {
  status: "pending" | "approved" | "rejected";
  request_id: string;
  created: boolean;
};

const isRequest = (value: unknown): value is BusinessInviteRequest => {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return (
    (result.status === "pending" ||
      result.status === "approved" ||
      result.status === "rejected") &&
    typeof result.request_id === "string" &&
    typeof result.created === "boolean"
  );
};

const requestErrorResponse = (message?: string) => {
  const normalized = message?.toLowerCase() || "";
  if (
    normalized.includes("authentication") ||
    normalized.includes("verify your email")
  ) {
    return Response.json(
      { error: "A verified account is required" },
      { status: 403 },
    );
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("expired") ||
    normalized.includes("limit")
  ) {
    return Response.json(
      { error: "This Business invitation is unavailable" },
      { status: 400 },
    );
  }
  return Response.json(
    { error: "Unable to submit Business access request" },
    { status: 503 },
  );
};

/** Submit one verified-account request for the printed Business invitation. */
export async function POST(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return Response.json(
      { error: identity.error },
      { status: identity.status },
    );
  }
  if (!identity.supabaseUserId) {
    return Response.json(
      { error: "Your account is still being connected. Please try again." },
      { status: 409 },
    );
  }

  const body = await request.json().catch(() => null);
  const code = normalizeInviteCode(body?.code);
  if (!code) {
    return Response.json(
      { error: "Invalid Business invitation code" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data, error } = await supabase.rpc(
    "request_business_invite_for_user",
    {
      p_user_id: identity.supabaseUserId,
      p_code: code,
    },
  );
  if (error || !isRequest(data)) {
    if (error)
      console.warn("[business-invite] request rejected:", error.message);
    return requestErrorResponse(error?.message);
  }

  // The database notification is transactional with the pending request. The
  // email is deliberately best-effort but awaited: Lambda can freeze after a
  // response, so fire-and-forget sends are not reliable.
  if (data.created) {
    const { data: approvers, error: approverError } = await supabase.rpc(
      "list_business_invite_approver_user_ids",
    );
    if (approverError) {
      console.warn(
        "[business-invite] approver lookup failed:",
        approverError.message,
      );
    } else {
      await Promise.all(
        (Array.isArray(approvers) ? approvers : []).map(async (approver) => {
          const recipientUserId =
            approver && typeof approver.user_id === "string"
              ? approver.user_id
              : null;
          if (!recipientUserId) return;
          const result = await sendCriticalNotificationEmail({
            recipientUserId,
            title: "Business access approval requested",
            message:
              "A verified account requested BSL and Colombia Blockchain Week Business access.",
            notificationType: "business_invite_review_required",
            actionUrl: "https://hashpass.tech/dashboard/business-invites",
            actionLabel: "Review request",
          });
          if (!result.success) {
            console.warn("[business-invite] approver email was not delivered");
          }
        }),
      );
    }
  }

  return Response.json(
    {
      status: data.status,
      request_id: data.request_id,
      created: data.created,
    },
    { status: data.created ? 201 : 200 },
  );
}
