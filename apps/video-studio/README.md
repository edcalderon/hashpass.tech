# hashpass-video-studio

Remotion-based studio for cutting HASHPASS marketing/demo videos — the BSL On
Tour showcase, the app tutorial/walkthrough, and future promo cuts — as
versioned React code instead of a `.aep`/`.prproj` binary nobody else on the
team can open or diff.

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
  index.ts              # registerRoot entry point
  Root.tsx               # registers the two compositions below
  constants.ts            # fps/resolution/intro-outro timing shared by both
  content/clips.ts        # the clip manifest — see "Adding a real recording"
  components/
    BrandBumper.tsx        # intro/outro title card (HASHPASS logo + copy)
    RecordingSlot.tsx       # renders a clip if present, else a placeholder card
  compositions/
    BslShowcase.tsx          # BSL On Tour showcase reel
    AppTutorial.tsx           # app walkthrough/tutorial
flows/                        # optional Playwright step scripts (see below)
public/
  brand/                      # HASHPASS logo SVGs (copied from apps/web-app/public)
  recordings/                  # raw screen captures land here (gitignored)
scripts/render.mjs             # renders every composition to out/*.mp4
```

Every composition boots and previews correctly with **zero recordings** —
`RecordingSlot` shows a "recording pending" placeholder card for any clip
whose `src` isn't set yet, so the studio is usable from the first `pnpm
install` and fills in incrementally as real footage lands.

## Adding a real recording

1. Capture footage (see below).
2. Drop the file into `public/recordings/`.
3. Set `src: 'your-file.webm'` on the matching entry in
   `src/content/clips.ts`.

That's it — no other code changes. `RecordingSlot` picks it up automatically
and the placeholder disappears.

## Capturing footage

**Web / Expo-web flows** (landing pages, dashboard, BSL event pages — these
all run on the Expo web target and the club Next.js app during `dev:all`):
use the Playwright recorder in `packages/tools/scripts/record-web-demo.mjs`:

```bash
pnpm --filter hashpass-video-studio record:web -- \
  --url http://localhost:8081/events/chile-2026/home \
  --name bsl-home-agenda \
  --flow apps/video-studio/flows/bsl-showcase.mjs
```

- Omit `--flow` for a quick single-screen capture — it just loads `--url`
  and auto-scrolls for `--duration` ms (default 8000).
- With `--flow`, write a small script exporting `default async (page) => {}`
  (Playwright `page` object) to script clicks/scrolls/waits — see
  `flows/bsl-showcase.mjs` and `flows/app-tutorial.mjs` for starting points.
  Both ship with placeholder selectors marked `TODO`; run once with
  `PWDEBUG=1` against a live `dev:all` session to find the real copy/labels
  and fill them in.
- OTP sign-in can't be scripted headlessly (it needs a real inbox/SMS to
  read the code) — `flows/app-tutorial.mjs` pauses for manual entry when the
  OTP screen shows up instead of trying to fake it.
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
adb pull /sdcard/demo.mp4 apps/video-studio/public/recordings/demo.mp4

# Or scrcpy, if installed, which can record while mirroring the screen live:
scrcpy --record apps/video-studio/public/recordings/demo.mp4
```

Then wire the file up the same way as a web recording (set `src` in
`src/content/clips.ts`).

## Rendering

```bash
pnpm video-studio:render                 # renders both compositions to out/*.mp4
pnpm --filter hashpass-video-studio render BslShowcase   # just one
```

`out/` and `public/recordings/` are gitignored — they're large binaries
regenerated from the compositions/flows, not source.
