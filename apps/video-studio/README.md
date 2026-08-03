# hashpass-video-studio

Remotion-based studio for cutting HASHPASS marketing/demo videos — the app
tutorial (landing → sign-in → dashboard networking), the BSL On Tour
showcase, and future promo cuts — as versioned React code instead of a
`.aep`/`.prproj` binary nobody else on the team can open or diff.

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
  Root.tsx                  # registers the two compositions, sizes each via calculateMetadata
  constants.ts               # fps/resolution/intro-outro/placeholder-clip timing
  content/clips.ts            # the clip manifest — see "Adding a real recording"
  lib/clip-layout.ts           # auto-sizes each clip's Sequence to its real recording length
  components/
    BrandBumper.tsx            # intro/outro title card (HASHPASS logo + copy)
    RecordingSlot.tsx           # renders a clip if present, else a placeholder card
  compositions/
    AppTutorial.tsx              # landing → OTP sign-in → Google sign-in → find speakers → request meeting
    BslShowcase.tsx               # BSL On Tour showcase reel
flows/                              # Playwright step scripts, one per recording (see below)
public/
  brand/                             # HASHPASS logo SVGs (copied from apps/web-app/public)
  recordings/                         # raw screen captures land here, one folder per flow (gitignored)
    landing/
    auth/otp/
    auth/google/
    dashboard/speakers/
    dashboard/meetings/
    bsl/
scripts/render.mjs                     # renders every composition to out/*.mp4
```

Every composition boots and previews correctly with **zero recordings** —
`RecordingSlot` shows a "recording pending" placeholder card for any clip
whose `src` isn't set yet, so the studio is usable from the first `pnpm
install` and fills in incrementally as real footage lands.

### Status

- **BslShowcase**: event landing + agenda-browse are real recordings; the
  meeting-request clip is still a placeholder (needs a real authenticated
  session — see the auth caveat below).
- **AppTutorial**: landing, OTP/magic-link sign-in form, dashboard entry, and
  browse-events-&-speakers are real recordings; attendee-profile update is
  still a placeholder — it needs a *real* logged-in user (see below), the
  dev auth bypass alone renders a permanent loading skeleton for it.

### Real captures need a real session — what an agent can and can't record

Two of the app's core flows can't be completed unattended:

- **OTP sign-in** needs a real inbox to read the 6-digit code.
- **Google sign-in** is actively blocked for automated browsers by Google's
  own bot detection, headed or not.

For screens that just need *any* logged-in state to render (not
account-specific data), `apps/mobile-app/lib/auth/dev-bypass.ts` is a
dev-only escape hatch: set `EXPO_PUBLIC_DEV_AUTH_BYPASS=true` in the mobile
app's env (propagates from the root `.env`) and restart the dev server —
gated so it's structurally inert outside `__DEV__` (never affects a release
build). It skips the redirect-to-`/auth` guard, but `user`/`dbUserId` stay
`null`. That was enough for the dashboard-explore and events/speakers
recordings (public data, doesn't depend on the signed-in user), but the
**attendee profile screen has nothing to show without a real user object**
— it renders a permanent skeleton loader under the bypass, not a bug, just
nothing to record. Get a real one via `flows/auth-otp.mjs` or
`flows/auth-google.mjs` with `--save-state`, then reuse that session with
`--use-state` for the profile (and any other account-specific) recording.

### Clips auto-size to the real recording length

Real captures vary a lot — a landing-page scroll is ~10s, an OTP or Google
sign-in recording with a manual-entry pause can run 30s+. `Root.tsx` uses
Remotion's `calculateMetadata` to call `layoutClips()`
(`src/lib/clip-layout.ts`), which reads each recorded file's real duration
via `getVideoMetadata` and sizes that clip's `Sequence` to match — no manual
frame-count math when you drop in a new recording. Clips still missing a
`src` fall back to a fixed placeholder length (`CLIP_FRAMES` in
`constants.ts`).

## Adding a real recording

1. Capture footage (see below) — it lands in the matching
   `public/recordings/<flow>/` folder.
2. Set `src: '<flow>/<file>.webm'` on the matching entry in
   `src/content/clips.ts`.

That's it — no other code changes. `RecordingSlot` picks it up and the
composition automatically re-times itself to the clip's real length.

## Capturing footage

**Web / Expo-web flows** — the landing page, sign-in, and dashboard all run
on the Expo web target during `dev:all` (`http://localhost:8081` by default,
check the printed port). Use the Playwright recorder in
`packages/tools/scripts/record-web-demo.mjs`, exposed as `record:web`.
`--name` may include the flow's subfolder, e.g. `landing/hero`.

| Step | Composition slot | Flow script | Status / notes |
|---|---|---|---|
| Landing page | `AppTutorial` #1 | `flows/landing.mjs` | ✅ Recorded. No auth needed. |
| Sign up — OTP or magic link | `AppTutorial` #2 | *(none — plain `--duration`)* | ✅ Recorded (form only, code not entered — see auth caveat above). |
| Enter the dashboard | `AppTutorial` #3 | `flows/dashboard-explore.mjs` | ✅ Recorded via the dev auth bypass. |
| Update attendee profile | `AppTutorial` #4 | `flows/dashboard-profile.mjs` | ⬜ Placeholder — needs a real session (dev bypass renders an empty skeleton here, see above). |
| Browse events & speakers | `AppTutorial` #5 | `flows/dashboard-events-speakers.mjs` | ✅ Recorded via the dev auth bypass. |
| Google sign-in (not in the core steps yet) | — | `flows/auth-google.mjs` | Needs `--headed --channel chrome`; Google blocks automated Chromium regardless, treat as a manual capture the script just kicks off. |
| BSL event landing + agenda | `BslShowcase` #1–2 | `flows/bsl-showcase.mjs` (#1), plain `--duration` (#2) | ✅ Recorded. No auth needed. |
| BSL meeting request & schedule | `BslShowcase` #3 | `flows/dashboard-find-speakers.mjs`, `flows/dashboard-request-meeting.mjs` | ⬜ Placeholder — needs a real session; `dashboard-request-meeting.mjs` stops before the final submit unless `CONFIRM_SEND=1`. |

Recordings above that finished at page-load-blank for the first several
seconds (client-side data fetching, not asset loading — a warmup
pre-navigation didn't fix it) were kept and trimmed with `trimStartSeconds`
on the matching `ClipSlot` in `clips.ts` instead of re-recorded — check a
new capture's early frames (`ffmpeg -i file.webm -ss 00:00:0N -frames:v 1
-update 1 out.png` for a few values of `N`) before assuming it needs a
trim; Metro serves from its warm bundle cache on repeat recordings against
an already-running dev server, so later captures of the *same route* in a
session often paint much faster than the first.

```bash
# Landing — no auth, no flags needed:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/home \
  --name landing/hero \
  --flow apps/video-studio/flows/landing.mjs

# OTP sign-in — headed, saves the resulting session for reuse below:
AUTH_DEMO_EMAIL=you@example.com \
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/auth \
  --name auth/otp/sign-in --headed \
  --flow apps/video-studio/flows/auth-otp.mjs \
  --save-state apps/video-studio/.recording-state/otp-session.json

# Account-specific screens (profile, meeting request) — reuse that real
# session instead of logging in again:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/dashboard/profile \
  --name dashboard/profile \
  --flow apps/video-studio/flows/dashboard-profile.mjs \
  --use-state apps/video-studio/.recording-state/otp-session.json

# Screens that just need *any* logged-in state (not real account data) can
# skip all of the above via the dev-only auth bypass instead — see the auth
# caveat section. No --use-state needed:
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/dashboard/explore \
  --name dashboard/explore \
  --flow apps/video-studio/flows/dashboard-explore.mjs
```

- Omit `--flow` for a quick single-screen capture — it just loads `--url`
  and auto-scrolls for `--duration` ms (default 8000).
- `--headed` runs a visible browser instead of headless — required for
  anything with a manual step (typing a real OTP code, completing Google's
  consent screen). `--channel chrome` uses a real installed Chrome instead
  of Playwright's bundled Chromium, which helps (but doesn't guarantee)
  getting past Google's automated-browser detection.
- `--save-state <path>` / `--use-state <path>` persist and reuse a login
  session (cookies + localStorage) across separate recordings, so the
  dashboard flows don't need their own login each time. State files are
  gitignored (`apps/video-studio/.recording-state/`) — they contain live
  session tokens, never commit them.
- Every flow script has real selectors pulled from the actual app copy
  ("Send Code", "Sign in with Google", "Find Speakers", "Request Meeting",
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
pnpm video-studio:render                 # renders both compositions to out/*.mp4
pnpm --filter hashpass-video-studio render BslShowcase   # just one
```

`out/`, `public/recordings/*` (contents, not the folders), and
`.recording-state/` are gitignored — they're large/sensitive artifacts
regenerated from the compositions/flows, not source.
