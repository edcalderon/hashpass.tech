import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

const ATTENDEE_FIELDS = 'full_name, title, company';
const MAX_TITLE_LENGTH = 160;
const MAX_COMPANY_LENGTH = 160;

type AttendeeRow = {
  full_name: string | null;
  title: string | null;
  company: string | null;
};

const toAttendeeProfile = (profile: AttendeeRow | null) => ({
  fullName: profile?.full_name ?? null,
  title: profile?.title ?? null,
  company: profile?.company ?? null,
});

const optionalText = (value: unknown, maxLength: number): string | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

async function authenticatedAttendeeIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) };
  }
  if (!identity.supabaseUserId) {
    return {
      response: Response.json(
        { error: 'Account is not linked to an attendee identity' },
        { status: 403 },
      ),
    };
  }
  return { userId: identity.supabaseUserId };
}

export async function GET(request: Request) {
  const auth = await authenticatedAttendeeIdentity(request);
  if ('response' in auth) return auth.response;

  const { data, error } = await getSupabaseServerForRequest(request)
    .from('user_profiles')
    .select(ATTENDEE_FIELDS)
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (error) {
    console.error('Unable to load attendee profile:', error.message);
    return Response.json({ error: 'Unable to load attendee profile' }, { status: 500 });
  }
  return Response.json({ data: toAttendeeProfile(data as AttendeeRow | null) });
}

export async function PATCH(request: Request) {
  const auth = await authenticatedAttendeeIdentity(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'A JSON body is required' }, { status: 400 });

  const title = optionalText(body.title, MAX_TITLE_LENGTH);
  if (title === undefined) return Response.json({ error: 'Title must be text' }, { status: 400 });
  const company = optionalText(body.company, MAX_COMPANY_LENGTH);
  if (company === undefined) return Response.json({ error: 'Company must be text' }, { status: 400 });

  const { data, error } = await getSupabaseServerForRequest(request)
    .from('user_profiles')
    .upsert(
      { user_id: auth.userId, title, company },
      { onConflict: 'user_id' },
    )
    .select(ATTENDEE_FIELDS)
    .single();
  if (error) {
    console.error('Unable to update attendee profile:', error.message);
    return Response.json({ error: 'Unable to update attendee profile' }, { status: 500 });
  }
  return Response.json({ data: toAttendeeProfile(data as AttendeeRow) });
}
