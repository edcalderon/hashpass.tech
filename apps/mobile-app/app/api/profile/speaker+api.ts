import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';

const SPEAKER_FIELDS = 'id, name, title, company, imageurl';
const MAX_NAME_LENGTH = 120;
const MAX_TITLE_LENGTH = 160;
const MAX_COMPANY_LENGTH = 160;
const MAX_IMAGE_URL_LENGTH = 2048;

type SpeakerRow = {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  imageurl: string | null;
};

const toProfileSpeaker = (speaker: SpeakerRow) => ({
  id: String(speaker.id),
  name: speaker.name,
  title: speaker.title,
  company: speaker.company,
  imageUrl: speaker.imageurl,
});

async function authenticatedSpeakerIdentity(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) {
    return { response: Response.json({ error: identity.error }, { status: identity.status }) };
  }
  if (!identity.supabaseUserId) {
    return {
      response: Response.json(
        { error: 'Account is not linked to a speaker identity' },
        { status: 403 },
      ),
    };
  }
  return { userId: identity.supabaseUserId };
}

async function getClaimedSpeaker(supabase: any, userId: string) {
  return supabase
    .from('bsl_speakers')
    .select(SPEAKER_FIELDS)
    .eq('user_id', userId)
    .maybeSingle();
}

export async function GET(request: Request) {
  const auth = await authenticatedSpeakerIdentity(request);
  if ('response' in auth) return auth.response;

  const { data, error } = await getClaimedSpeaker(getSupabaseServerForRequest(request), auth.userId);
  if (error) {
    console.error('Unable to load the claimed speaker profile:', error.message);
    return Response.json({ error: 'Unable to load speaker profile' }, { status: 500 });
  }
  return Response.json({ data: data ? toProfileSpeaker(data as SpeakerRow) : null });
}

const optionalText = (value: unknown, maxLength: number): string | null | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
};

const validImageUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

export async function PATCH(request: Request) {
  const auth = await authenticatedSpeakerIdentity(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'A JSON body is required' }, { status: 400 });

  const updates: Record<string, string | null> = {};
  if (body.name !== undefined) {
    const name = optionalText(body.name, MAX_NAME_LENGTH);
    if (!name) return Response.json({ error: 'A speaker name is required' }, { status: 400 });
    updates.name = name;
  }
  if (body.title !== undefined) {
    const title = optionalText(body.title, MAX_TITLE_LENGTH);
    if (title === undefined) return Response.json({ error: 'Display role must be text' }, { status: 400 });
    updates.title = title;
  }
  if (body.company !== undefined) {
    const company = optionalText(body.company, MAX_COMPANY_LENGTH);
    if (company === undefined) return Response.json({ error: 'Company must be text' }, { status: 400 });
    updates.company = company;
  }
  if (body.imageUrl !== undefined) {
    if (typeof body.imageUrl !== 'string' || body.imageUrl.length > MAX_IMAGE_URL_LENGTH || !validImageUrl(body.imageUrl)) {
      return Response.json({ error: 'imageUrl must be a valid HTTP(S) URL' }, { status: 400 });
    }
    updates.imageurl = body.imageUrl;
  }
  if (!Object.keys(updates).length) {
    return Response.json({ error: 'At least one speaker field is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data: speaker, error: speakerError } = await getClaimedSpeaker(supabase, auth.userId);
  if (speakerError) {
    console.error('Unable to load the claimed speaker profile:', speakerError.message);
    return Response.json({ error: 'Unable to load speaker profile' }, { status: 500 });
  }
  if (!speaker) return Response.json({ error: 'No claimed speaker profile was found' }, { status: 404 });

  const { data, error } = await supabase
    .from('bsl_speakers')
    .update(updates)
    .eq('id', speaker.id)
    .eq('user_id', auth.userId)
    .select(SPEAKER_FIELDS)
    .single();
  if (error) {
    console.error('Unable to update the claimed speaker profile:', error.message);
    return Response.json({ error: 'Unable to update speaker profile' }, { status: 500 });
  }
  return Response.json({ data: toProfileSpeaker(data as SpeakerRow) });
}
