import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import {
  isResolveIdentityError,
  resolveNotificationIdentity,
} from '@/lib/server/resolve-notification-identity';
import { isAllowedAvatarUrl } from '@/lib/avatar-guards';
import type { AvatarSource } from '@/types/speaker-profile.types';

const LEGACY_SPEAKER_FIELDS = 'id, name, title, company, imageurl, is_active, is_accepting_meetings';
const SPEAKER_FIELDS = `${LEGACY_SPEAKER_FIELDS}, event_imageurl, avatar_source, do_not_disturb`;
const AVATAR_SOURCES = ['event', 'personal'] as const;
// Postgres "undefined_column": the avatar-source migration is not applied yet.
const UNDEFINED_COLUMN = '42703';
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
  event_imageurl?: string | null;
  avatar_source?: AvatarSource | null;
  do_not_disturb?: boolean | null;
  is_active: boolean;
  is_accepting_meetings: boolean;
};

const toProfileSpeaker = (speaker: SpeakerRow) => ({
  id: String(speaker.id),
  name: speaker.name,
  title: speaker.title,
  company: speaker.company,
  imageUrl: speaker.imageurl,
  eventImageUrl: speaker.event_imageurl ?? speaker.imageurl,
  avatarSource: speaker.avatar_source === 'personal' ? 'personal' : 'event',
  isActive: speaker.is_active,
  doNotDisturb: speaker.do_not_disturb === true,
  isAcceptingMeetings: speaker.is_accepting_meetings,
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
  const query = (fields: string) =>
    supabase.from('bsl_speakers').select(fields).eq('user_id', userId).maybeSingle();
  const result = await query(SPEAKER_FIELDS);
  // Keep the profile readable until the avatar-source migration reaches this database.
  if (result.error?.code === UNDEFINED_COLUMN) return query(LEGACY_SPEAKER_FIELDS);
  return result;
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

export async function PATCH(request: Request) {
  const auth = await authenticatedSpeakerIdentity(request);
  if ('response' in auth) return auth.response;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: 'A JSON body is required' }, { status: 400 });

  const updates: Record<string, string | boolean | null> = {};
  let avatarSource: AvatarSource | undefined;
  if (body.avatarSource !== undefined) {
    if (!AVATAR_SOURCES.includes(body.avatarSource as AvatarSource)) {
      return Response.json({ error: 'avatarSource must be "event" or "personal"' }, { status: 400 });
    }
    avatarSource = body.avatarSource as AvatarSource;
  }
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
    if (
      typeof body.imageUrl !== 'string' ||
      body.imageUrl.length > MAX_IMAGE_URL_LENGTH ||
      !isAllowedAvatarUrl(body.imageUrl)
    ) {
      return Response.json({ error: 'imageUrl must be an HTTPS URL from an allowed image host' }, { status: 400 });
    }
    updates.imageurl = body.imageUrl.trim();
    // Choosing a specific personal picture is choosing the personal source.
    avatarSource ??= 'personal';
  }
  if (avatarSource === 'personal' && updates.imageurl === undefined) {
    return Response.json({ error: 'imageUrl is required to use a personal photo' }, { status: 400 });
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return Response.json({ error: 'isActive must be a boolean' }, { status: 400 });
    }
    // The profile switch controls the complete public/requestable state. Keep
    // the dependent flags in sync so reactivating a retired profile really
    // makes it visible and able to receive meeting requests again.
    updates.is_active = body.isActive;
    updates.is_accepting_meetings = body.isActive;
    if (body.isActive) updates.directory_visible = true;
  }
  if (body.doNotDisturb !== undefined) {
    if (typeof body.doNotDisturb !== 'boolean') {
      return Response.json({ error: 'doNotDisturb must be a boolean' }, { status: 400 });
    }
    updates.do_not_disturb = body.doNotDisturb;
  }
  if (!Object.keys(updates).length && !avatarSource) {
    return Response.json({ error: 'At least one speaker field is required' }, { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  const { data: speaker, error: speakerError } = await getClaimedSpeaker(supabase, auth.userId);
  if (speakerError) {
    console.error('Unable to load the claimed speaker profile:', speakerError.message);
    return Response.json({ error: 'Unable to load speaker profile' }, { status: 500 });
  }
  if (!speaker) return Response.json({ error: 'No claimed speaker profile was found' }, { status: 404 });

  if (avatarSource) {
    updates.avatar_source = avatarSource;
    // The event photo is never taken from the client: switching back restores
    // the one the event assigned, and it is captured before it is overwritten.
    const currentEvent = (speaker as SpeakerRow).event_imageurl ?? (speaker as SpeakerRow).imageurl;
    if (avatarSource === 'event') {
      if (!currentEvent) {
        return Response.json({ error: 'This speaker has no event photo to switch to' }, { status: 409 });
      }
      updates.imageurl = currentEvent;
    } else if ((speaker as SpeakerRow).event_imageurl == null && (speaker as SpeakerRow).avatar_source !== 'personal') {
      updates.event_imageurl = (speaker as SpeakerRow).imageurl;
    }
  }

  const { data, error } = await supabase
    .from('bsl_speakers')
    .update(updates)
    .eq('id', speaker.id)
    .eq('user_id', auth.userId)
    .select(SPEAKER_FIELDS)
    .single();
  if (error) {
    console.error('Unable to update the claimed speaker profile:', error.message);
    if (error.code === UNDEFINED_COLUMN) {
      return Response.json({ error: 'This speaker setting is not available yet' }, { status: 503 });
    }
    return Response.json({ error: 'Unable to update speaker profile' }, { status: 500 });
  }
  return Response.json({ data: toProfileSpeaker(data as SpeakerRow) });
}
