import { isRoleActive } from "@/lib/role-summary";

import type { ContactClient, HolderContact } from "@/types/qr-holder-contact.types";

export type { HolderContact };

/**
 * Holder email and username are only for staff who run the door: global
 * admins, or an event admin/moderator for the pass's own event. A regular
 * attendee scanning a badge sees the name alone.
 */
export async function canViewHolderContact(
  supabase: ContactClient,
  viewerUserId: string | null | undefined,
  eventId: string | null | undefined,
): Promise<boolean> {
  if (!viewerUserId) return false;
  const [globalResult, eventResult] = await Promise.all([
    supabase.from("user_roles").select("role,expires_at").eq("user_id", viewerUserId).in("role", ["super_admin", "admin"]),
    eventId
      ? supabase.from("event_roles").select("role,expires_at").eq("user_id", viewerUserId).eq("event_id", eventId).in("role", ["event_admin", "moderator"])
      : Promise.resolve({ data: [], error: null }),
  ]);
  const active = (result: { data?: { expires_at: string | null }[] | null; error?: unknown }) =>
    !result.error && (result.data || []).some((row) => isRoleActive(row.expires_at));
  return active(globalResult) || active(eventResult);
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export async function loadHolderContact(supabase: ContactClient, userId: string): Promise<HolderContact> {
  let email: string | null = null;
  let username: string | null = null;
  try {
    const result = await supabase.auth?.admin?.getUserById(userId);
    const user = result?.data?.user;
    email = text(user?.email);
    username = text(user?.user_metadata?.username) || text(user?.user_metadata?.user_name);
  } catch {
    // Fall back to the registry below.
  }
  if (!email || !username) {
    const { data } = await supabase.from("user").select("email,profile_metadata").eq("id", userId).maybeSingle();
    email = email || text(data?.email);
    username = username || text(data?.profile_metadata?.username);
  }
  if (!email) {
    const { data } = await supabase.from("user_profiles").select("email").eq("user_id", userId).maybeSingle();
    email = text(data?.email);
  }
  return { email, username };
}
