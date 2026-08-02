import {
  resolveNotificationIdentity,
  isResolveIdentityError,
} from "@/lib/server/resolve-notification-identity";

// Meeting RPCs, passes, and claimed speaker ownership are all keyed by the
// Supabase auth UUID. The registry user ID is a separate identity domain.
export async function authenticatedIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity))
    return {
      response: Response.json(
        { error: identity.error },
        { status: identity.status },
      ),
    };
  const meetingUserId = identity.supabaseUserId;
  if (!meetingUserId)
    return {
      response: Response.json(
        { error: "Account is not linked to a meeting identity" },
        { status: 403 },
      ),
    };
  return { identity, meetingUserId };
}
