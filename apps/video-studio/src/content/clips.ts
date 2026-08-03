export type ClipSlot = {
  /**
   * Filename inside public/recordings/, e.g. "landing/hero.webm". Leave
   * undefined until the real screen capture is recorded — the composition
   * renders a "recording pending" placeholder card instead of failing, so
   * the studio always boots even with an empty library.
   */
  src?: string;
  title: string;
  caption?: string;
  /**
   * Seconds to skip from the start of the raw recording — real captures
   * always include a few seconds of page-load/hydration before the app
   * paints real content (Playwright's video starts recording at context
   * creation, before the navigation even begins), and this trims that dead
   * air out of the final cut without needing to re-record.
   */
  trimStartSeconds?: number;
};

// HASHPASS app walkthrough / tutorial — core basics first: landing, sign up
// (OTP or email magic link), into the dashboard, updating the attendee
// profile, then browsing events/speakers. Google sign-in and meeting-request
// are follow-ups once this core path is recorded — see flows/ for all of
// them. Record each with `pnpm --filter hashpass-video-studio record:web`,
// using the matching flow script in apps/video-studio/flows/ (README.md has
// the exact commands, including carrying an authenticated session from the
// sign-in recording into the dashboard recordings).
export const appTutorialSteps: ClipSlot[] = [
  {src: 'landing/hero.webm', title: 'Landing page', caption: 'hashpass.tech/home', trimStartSeconds: 9},
  {
    src: 'auth/otp/sign-in-form.webm',
    title: 'Sign up — OTP or magic link',
    caption: 'Email sign-in',
    trimStartSeconds: 8,
  },
  {src: 'dashboard/explore.webm', title: 'Enter the dashboard', caption: 'Post-login explore', trimStartSeconds: 7},
  // Recorded via the dev-only auth bypass (apps/mobile-app/lib/auth/dev-bypass.ts)
  // to reach the route without a real session — but that bypass leaves
  // `user` null, and this screen has nothing to show without a real
  // attendee profile (perpetual loading skeleton, not a rendering bug).
  // Needs a real --save-state session from flows/auth-otp.mjs or
  // flows/auth-google.mjs to record for real.
  {title: 'Update attendee profile'},
  {
    src: 'dashboard/speakers/browse-events.webm',
    title: 'Browse events & speakers',
    trimStartSeconds: 3,
  },
];

// BSL On Tour showcase — fill in `src` as recordings land in
// public/recordings/bsl/. Capture with the Playwright recorder for web
// flows, or adb/scrcpy for the native Android app (see README.md).
// trimStartSeconds skips the page-load/hydration lead-in that's always
// baked into a raw capture (recording starts before the navigation does).
export const bslShowcaseClips: ClipSlot[] = [
  {
    src: 'bsl/event-landing.webm',
    title: 'Event landing & pass claim',
    caption: 'bsl.hashpass.tech',
    trimStartSeconds: 5.7,
  },
  {src: 'bsl/agenda-browse.webm', title: 'BSL On Tour hero + agenda browse', trimStartSeconds: 3.5},
  // Needs a real authenticated session (OTP or Google) — not something an
  // agent can complete unattended. Record with flows/auth-otp.mjs or
  // flows/auth-google.mjs (--save-state), then flows/dashboard-request-meeting.mjs
  // (--use-state) pointed at a chile2026 speaker profile.
  {title: 'Meeting request & schedule'},
];
