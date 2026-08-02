-- accept_meeting_request, decline_meeting_request,
-- block_user_and_decline_request, and cancel_meeting_request are all called
-- via supabase.rpc(...) (a JSON RPC over PostgREST), which resolves the
-- target function by argument NAMES, not types, since a JSON payload
-- carries no type information. Each of these four functions had an older,
-- pre-V017 overload still live alongside the current one (same parameter
-- names, different types -- typically p_request_id/p_user_id as uuid
-- instead of text) -- discovered live on the dev database, not merely
-- theoretical. A same-name, same-arity overload set makes PostgREST's
-- function resolution ambiguous (the exact PGRST202/PGRST203 class of
-- problem V040 already fixed for get_speaker_available_slots), so any of
-- these four RPC calls could non-deterministically fail or resolve to
-- long-obsolete logic. Drop every overload except the one the app's API
-- routes actually call.

DROP FUNCTION IF EXISTS public.accept_meeting_request(uuid, text, text);
DROP FUNCTION IF EXISTS public.accept_meeting_request(uuid, text, timestamptz, text);

DROP FUNCTION IF EXISTS public.decline_meeting_request(uuid, text, text);

DROP FUNCTION IF EXISTS public.block_user_and_decline_request(uuid, text, uuid, text);

DROP FUNCTION IF EXISTS public.cancel_meeting_request(uuid, uuid);
