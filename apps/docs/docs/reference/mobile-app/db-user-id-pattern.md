# `dbUserId`: why it's a separate field from `user`

Shipped in v1.8.273 alongside the [Better Auth ↔ Supabase identity bridge](../../auth/USER_REGISTRY.md#path-4--better-auth--supabase-bridge-v18273).

## The bug this fixes

`a prior Better-Auth Google sign-in` (redacted for privacy) hit:

```
Error loading tutorial progress: Object { code: "22P02", details: null, hint: null,
  message: 'invalid input syntax for type uuid: "6A4inLMo7lHzrgfTEgm7Z8jBo8XjN4Ct"' }
```

`useAuth()`'s `user` object is priority-resolved by `auth-session-machine.ts`'s
`PROVIDER_PRIORITY = ['betterAuth', 'supabase', 'directus']` — it **always**
prefers Better Auth's own user over a bridged Supabase session, for every
tenant. Better Auth's `id` is its own internal id format, not a Postgres
uuid. Any code that took `user.id` and passed it into a `uuid`-typed Supabase
column (a query filter, an RPC parameter, a `.eq('user_id', user.id)`) threw
this exact error — silently, for every Better-Auth-signed-in user, on every
feature that touched such a column: tutorial progress, user blocking, passes,
meeting requests, networking stats, chat.

## The fix

`useAuth.ts` now exposes a second field, `dbUserId`, sourced independently
from `supabase.auth.onAuthStateChange()` / the initial `supabase.auth.getSession()`
bootstrap — **not** from the priority-resolved `user`. It is either a real
Supabase uuid (once the session bridge has landed) or `null` (before it
lands, or if the bridge failed). It is cleared synchronously in `signOut()`.

**Rule: any code querying a Supabase table by "the signed-in user's id" must
use `dbUserId`, never `user.id`.** `user` is still correct for
provider-agnostic display data (email, name, avatar) — it is not being
replaced, just no longer trusted as a uuid source.

## Why not just use `user` alone?

This has been raised more than once — `user` is one field, `dbUserId` is a
second one that has to stay in sync, and that shape does look like the kind
of duplication worth collapsing. The reason they're kept separate is a
**timing / race-window argument, not a naming preference**:

- `user` becomes non-null the moment Better Auth's own session resolves —
  before the Supabase bridge endpoint (`POST /api/auth/supabase-bridge`) has
  necessarily been called or completed. There is a real window, on every
  sign-in, where a Better-Auth user exists but no Supabase uuid does yet.
- If `user.id` were made to *become* the Supabase uuid once the bridge
  landed, every consumer would need to additionally guard on "has the bridge
  landed yet," which is exactly what a second nullable field already
  expresses for free — `dbUserId == null` **is** that guard.
- Collapsing them into one field would require either (a) delaying `user`
  until the bridge resolves — which reintroduces a load-bearing dependency
  on a fire-and-forget, best-effort side channel for the primary sign-in
  path, something the bridge was deliberately designed to never be — or (b)
  silently overwriting `user.id`'s meaning mid-lifecycle depending on bridge
  timing, which is a subtler and harder-to-debug hazard than two
  explicitly-named fields.

This is the resolved design as of v1.8.273. If a future change makes the
Supabase bridge synchronous/blocking on sign-in (removing the race window
entirely), revisit whether `dbUserId` can be folded back into `user` at that
point — but as long as the bridge is fire-and-forget, the two fields track
genuinely different things and should stay separate.

## Files using `dbUserId`

Audited and fixed in v1.8.273 (all previously used `user.id` against a
Supabase `uuid` column):

- `apps/mobile-app/hooks/useTutorialPreferences.ts`
- `apps/mobile-app/hooks/useBlockUser.ts`
- `apps/mobile-app/components/RealtimeChat.tsx`
- `apps/mobile-app/components/MeetingChat.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/meeting-chat.tsx` (the
  route wrapper around `MeetingChat.tsx` -- missed in the original v1.8.273
  audit, found and fixed alongside the [e2e meeting chat rework](./e2e-meeting-chat.md))
- `apps/mobile-app/components/PassesDisplay.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/my-schedule.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/my-meetings.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/my-requests.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/index.tsx`
- `apps/mobile-app/app/events/[eventSlug]/networking/blocked.tsx`
- `apps/mobile-app/app/events/[eventSlug]/speakers/[id].tsx`
- `apps/mobile-app/app/_layout.tsx`
- `apps/mobile-app/app/(shared)/dashboard/qr-view.tsx`
- `apps/mobile-app/app/(shared)/dashboard/pass-details.tsx`

Some of these (`networking/index.tsx`, `speakers/[id].tsx`, `MeetingChat.tsx`,
`RealtimeChat.tsx`) still keep `user` alongside `dbUserId` for display data
(`.email`, `.user_metadata`) or chat UI/presence — only the Supabase
query/RPC call sites switched.

## Adding a new Supabase-querying feature

If you're writing new code that needs "the current user" to query or write a
Supabase table:

1. Destructure `dbUserId` from `useAuth()`, not `user.id`.
2. Guard on `dbUserId` being non-null before firing the query (it will be
   `null` briefly after sign-in, or permanently if the bridge failed).
3. Only fall back to `user` if you need provider-agnostic display data, not
   an id for a `uuid` column.
