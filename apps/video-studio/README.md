# hashpass-video-studio

Remotion-based studio for cutting HASHPASS marketing/demo videos — the app
tutorial (landing → sign-up → dashboard → profile → events → PWA install, in
**English and Spanish**), the BSL On Tour showcase, and future promo cuts —
as versioned React code instead of a `.aep`/`.prproj` binary nobody else on
the team can open or diff.

## Why Remotion (and not something else)

Evaluated against the realistic alternatives before scaffolding this app:

| Tool | Verdict |
|---|---|
| **Remotion** (chosen) | Programmatic video-as-React, ships a real editor (Remotion Studio) with a scrubbable timeline/player, renders via headless Chrome + bundled ffmpeg, has a mature CLI/render farm story, and — the deciding factor for this repo — compositions can directly reuse `@hashpass/ui`, `@hashpass/i18n`, and the brand SVGs already in the monorepo. No other tool below can do that. |
| Motion Canvas / Revideo | Code-based like Remotion, but centered on a custom canvas/vector-scene API, not React — can't reuse existing app components, smaller ecosystem, weaker CLI/render tooling. |
| Shotstack / Creatomate (cloud template APIs) | Fast for swapping text into a fixed template, but it's JSON-template-driven, not code — no component reuse, adds a paid external dependency and vendor lock-in for something we can self-host. |
| After Effects / Premiere | Most powerful *manual* editor, but binary project files don't diff or review in git, and there's no way to script "record the real app and cut it automatically." Fine for a human polish pass on the final export if ever needed, not for the pipeline itself. |
| Editly / FFCreator | Lightweight ffmpeg/canvas video assemblers — good for one-off config-driven cuts, but no live preview editor and no component model. Strictly less capable than Remotion for this use case. |

Conclusion: Remotion stays the most powerful option on the market for this
specific job (component reuse + real preview/editing studio + scriptable
render pipeline), so this app is a straight Remotion Studio setup, not a
custom build.

## Quickstart

```bash
pnpm dev:video-studio          # just the studio
# or
pnpm dev:all                   # studio + mobile app + club web + docs + directus
```

`dev:all` claims a port starting at `VIDEO_STUDIO_PORT` (default `3105`,
auto-bumps if busy — check the "Using ports:" line it prints) and opens
Remotion Studio there alongside the other dev servers, so you can record a
flow from the running mobile-app/web-app dev server and drop the capture
straight into the studio without leaving the `dev:all` session.

## Layout

```
src/
  index.ts                 # registerRoot entry point
  Root.tsx                  # registers BslShowcase, AppTutorialEN, AppTutorialES via calculateMetadata
  constants.ts               # fps/resolution/intro-outro/placeholder-clip timing
  content/clips.ts            # the clip manifests (EN + ES) — see "Adding a real recording"
  lib/clip-layout.ts           # auto-sizes each clip's Sequence to its real recording length
  components/
    BrandBumper.tsx            # intro/outro title card (HASHPASS logo + copy, translatable props)
    RecordingSlot.tsx           # renders a clip if present, else a placeholder card
    PlayStoreBadge.tsx           # "GET IT ON Google Play" badge overlay for the install-CTA clip
  compositions/
    AppTutorial.tsx               # shared component for both AppTutorialEN/ES (Root.tsx passes the language's steps + bumper copy)
    BslShowcase.tsx                # BSL On Tour showcase reel
flows/                               # Playwright step scripts, one per recording (see below)
  lib/dismiss-cookie-banner.mjs       # shared helper: dismiss the cookie-consent banner before scrolling/clicking
public/
  brand/                                # HASHPASS logo SVGs (copied from apps/web-app/public)
  recordings/                            # raw screen captures land here, one folder per flow (gitignored)
    landing/  auth/otp/  auth/google/  dashboard/  dashboard/speakers/  pwa/  bsl/
scripts/render.mjs                        # renders every composition to out/*.mp4
```

Every composition boots and previews correctly with **zero recordings** —
`RecordingSlot` shows a "recording pending" placeholder card for any clip
whose `src` isn't set yet, so the studio is usable from the first `pnpm
install` and fills in incrementally as real footage lands.

### Status

- **BslShowcase**: event landing + agenda-browse are real recordings; the
  meeting-request clip is still a placeholder (needs a real authenticated
  session — see the auth section below).
- **AppTutorialEN / AppTutorialES**: all 6 steps are real recordings —
  landing, OTP/magic-link sign-up, dashboard entry, attendee-profile update,
  browse events & speakers (with an actual event switch demonstrated), and
  installing the app as a PWA.

### Real captures need a real session — how this got unblocked

Two of the app's core flows can't be completed unattended by an agent:

- **OTP sign-in** needs a real inbox to read the 6-digit code.
- **Google sign-in** is actively blocked for automated browsers by Google's
  own bot detection, headed or not.

For the dashboard/profile/events recordings, `packages/tools/scripts/create-demo-session.mjs`
mints a **real** Supabase session for a dedicated demo account
(`video-studio-demo@hashpass.tech`) without going through either of those —
it mirrors exactly what the app's own server-side OTP flow does
(`admin.generateLink()` + a direct GoTrue `/verify` call), the same two-step
dance a human completes by reading a real email, just without the email
round-trip. It also upserts the `public.user` registry row the demo
account's `auth.users` id needs — most downstream tables (`user_profiles`,
etc.) FK against `public.user.id`, and that registry sync normally only
happens inside the app's own auth API routes, which this path skips:

```bash
node packages/tools/scripts/create-demo-session.mjs
# writes apps/video-studio/.recording-state/demo-session.json
```

The result is a Playwright `storageState` JSON — pass it straight to
`--use-state` on any recording. It contains live session tokens; it's
gitignored (`apps/video-studio/.recording-state/`) and must never be
committed.

For screens that just need *any* logged-in state and don't touch real
account data, `apps/mobile-app/lib/auth/dev-bypass.ts` is a lighter dev-only
alternative (`EXPO_PUBLIC_DEV_AUTH_BYPASS=true`, `__DEV__`-gated) — but the
attendee-profile screen specifically renders a permanent loading skeleton
under it (`user` stays `null`), so that one needs the real demo session.

### Recording in Spanish

`record-web-demo.mjs --locale es-ES` is all it takes — the app's i18n
(`apps/mobile-app/i18n/i18n.ts`) picks its initial language from the
browser's own locale (`expo-localization`) on first load, with no stored
override and no in-app language-switch click needed. `content/clips.ts`
exports `appTutorialStepsEn` and `appTutorialStepsEs` (own translated
titles/captions), and `Root.tsx` registers them as separate compositions,
`AppTutorialEN` / `AppTutorialES`, each with its own translated intro/outro
bumper copy passed as props to the shared `AppTutorial` component.

One real, honest gap: the attendee-profile screen
(`app/(shared)/dashboard/profile.tsx`) hardcodes its English strings rather
than using the app's `t()` helper, so that one clip's on-screen chrome
("Attendee Information", "Edit Attendee Information", etc.) stays English
even in the ES composition — a real characteristic of the current app, not
a recording bug.

### Clips auto-size to the real recording length

Real captures vary a lot — a landing-page scroll is ~10s, an OTP or Google
sign-in recording with a manual-entry pause can run 30s+. `Root.tsx` uses
Remotion's `calculateMetadata` to call `layoutClips()`
(`src/lib/clip-layout.ts`), which reads each recorded file's real duration
via `getVideoMetadata` and sizes that clip's `Sequence` to match — no manual
frame-count math when you drop in a new recording. Clips still missing a
`src` fall back to a fixed placeholder length (`CLIP_FRAMES` in
`constants.ts`).

Every real capture also has a few seconds of blank page-load baked into its
start (Playwright's video starts recording at browser-context creation,
before the navigation even begins — a warmup pre-navigation doesn't fix it,
since the delay is client-side data fetching, not asset loading). Rather
than re-recording, set `trimStartSeconds` on the `ClipSlot` to skip that
dead air — check a new capture's early frames first:

```bash
ffmpeg -i public/recordings/<file>.webm -ss 00:00:0N -frames:v 1 -update 1 out.png
# try a few values of N; once file size jumps from ~8.6KB (blank) to real
# content, that's roughly your trim point
```

Metro serves from its warm bundle cache on repeat recordings against an
already-running dev server, so later captures of the *same route* in a
session often paint much faster than the first — don't assume every clip
needs the same trim.

## Adding a real recording

1. Capture footage (see below) — it lands in the matching
   `public/recordings/<flow>/` folder.
2. Set `src: '<flow>/<file>.webm'` on the matching entry in
   `src/content/clips.ts` (`appTutorialStepsEn`/`Es` or `bslShowcaseClips`).

That's it — no other code changes. `RecordingSlot` picks it up and the
composition automatically re-times itself to the clip's real length.

## Capturing footage

**Web / Expo-web flows** — the landing page, sign-in, and dashboard all run
on the Expo web target during `dev:all` (`http://localhost:8081` by default,
check the printed port). Use the Playwright recorder in
`packages/tools/scripts/record-web-demo.mjs`, exposed as `record:web`.
`--name` may include the flow's subfolder, e.g. `landing/hero`.

| Step | Flow script | Auth needed |
|---|---|---|
| Landing page | `flows/landing.mjs` | None |
| Sign up — OTP or magic link | *(none — plain `--duration`)* | None (form only, code not entered) |
| Enter the dashboard | `flows/dashboard-explore.mjs` | Real session or dev bypass |
| Update attendee profile | `flows/dashboard-profile.mjs` | **Real session required** |
| Browse events & speakers | `flows/dashboard-events-speakers.mjs` | Real session or dev bypass |
| Install as an app (PWA) | `flows/pwa-install.mjs` | None |
| Google sign-in (not in the core 6 steps yet) | `flows/auth-google.mjs` | — (this *is* the sign-in) |
| BSL event landing + agenda | `flows/bsl-showcase.mjs` (+ plain `--duration`) | None |
| BSL meeting request & schedule | `flows/dashboard-find-speakers.mjs`, `flows/dashboard-request-meeting.mjs` | **Real session required** |

```bash
# 1. Mint a real demo session once (see "Real captures need a real session" above):
node packages/tools/scripts/create-demo-session.mjs

# 2. Landing / sign-up form / PWA install — no auth needed:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/home --name landing/hero \
  --flow apps/video-studio/flows/landing.mjs

pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/home --name pwa/install \
  --flow apps/video-studio/flows/pwa-install.mjs

# 3. Dashboard / profile / events — reuse the demo session:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/dashboard/profile --name dashboard/profile-update \
  --flow apps/video-studio/flows/dashboard-profile.mjs \
  --use-state apps/video-studio/.recording-state/demo-session.json

# 4. Same again with --locale es-ES for the Spanish take, e.g.:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/dashboard/explore --name dashboard/explore-es \
  --flow apps/video-studio/flows/dashboard-explore.mjs \
  --use-state apps/video-studio/.recording-state/demo-session.json \
  --locale es-ES
```

- Omit `--flow` for a quick single-screen capture — it just loads `--url`
  and auto-scrolls for `--duration` ms (default 8000).
- `--headed` runs a visible browser instead of headless — required for
  anything with a manual step (typing a real OTP code, completing Google's
  consent screen). `--channel chrome` uses a real installed Chrome instead
  of Playwright's bundled Chromium, which helps (but doesn't guarantee)
  getting past Google's automated-browser detection.
- `--save-state <path>` / `--use-state <path>` persist and reuse a login
  session (cookies + localStorage) across separate recordings. State files
  are gitignored — they contain live session tokens, never commit them.
- `--locale es-ES` records the app in Spanish — see "Recording in Spanish"
  above.
- `flows/lib/dismiss-cookie-banner.mjs` is a shared helper — import it in
  any new flow that scrolls into or clicks something near the bottom of the
  viewport, since the cookie-consent banner sits fixed there on first visit
  and both obscures content and intercepts clicks until dismissed.
- Every flow script has real selectors pulled from the actual app copy
  ("Send Code", "Sign in with Google", "Find Speakers", "Install HASHPASS",
  etc. — see `flows/*.mjs`), not placeholders. If the app's copy changes,
  update the matching regex there.
- Output is `.webm` (Playwright's native format) — Remotion's `OffthreadVideo`
  decodes it directly via its bundled ffmpeg, no conversion step needed.

**Native Android** (the real BSL/app flows on-device, for footage the web
target can't produce): use
[local-android-debugging.md](../docs/docs/reference/mobile-app/local-android-debugging.md)
to get an emulator/device connected via `adb`, then capture with either:

```bash
# Straight to a video file via adb (device-side, then pull it):
adb shell screenrecord /sdcard/demo.mp4
# ...Ctrl+C when done, then:
adb pull /sdcard/demo.mp4 apps/video-studio/public/recordings/bsl/demo.mp4

# Or scrcpy, if installed, which can record while mirroring the screen live:
scrcpy --record apps/video-studio/public/recordings/bsl/demo.mp4
```

Then wire the file up the same way as a web recording (set `src` in
`src/content/clips.ts`).

## Rendering

```bash
pnpm video-studio:render                 # renders every composition to out/*.mp4
pnpm --filter hashpass-video-studio render AppTutorialEN   # just one
pnpm --filter hashpass-video-studio render AppTutorialES
pnpm --filter hashpass-video-studio render BslShowcase
```

`out/`, `public/recordings/*` (contents, not the folders), and
`.recording-state/` are gitignored — they're large/sensitive artifacts
regenerated from the compositions/flows, not source.
