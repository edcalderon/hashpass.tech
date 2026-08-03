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
};

// HASHPASS app walkthrough / tutorial steps — landing, both sign-in methods,
// then the dashboard's speaker-discovery + meeting-request flow. Record each
// with `pnpm --filter hashpass-video-studio record:web`, using the matching
// flow script in apps/video-studio/flows/ (see README.md for the exact
// commands, including how to carry an authenticated session from the
// sign-in recording into the dashboard recordings).
export const appTutorialSteps: ClipSlot[] = [
  {title: 'Landing page', caption: 'hashpass.tech/home'},
  {title: 'Sign in with email OTP', caption: '6-digit code'},
  {title: 'Sign in with Google', caption: 'OAuth'},
  {title: 'Find speakers', caption: 'Dashboard → Networking'},
  {title: 'Request a meeting'},
];

// BSL On Tour showcase — fill in `src` as recordings land in
// public/recordings/bsl/. Capture with the Playwright recorder for web
// flows, or adb/scrcpy for the native Android app (see README.md).
export const bslShowcaseClips: ClipSlot[] = [
  {title: 'Event landing & pass claim', caption: 'bsl.hashpass.tech'},
  {title: 'BSL On Tour hero + agenda browse'},
  {title: 'Meeting request & schedule'},
];
