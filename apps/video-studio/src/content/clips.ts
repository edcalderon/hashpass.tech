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
  /** Overlay a "GET IT ON Google Play" badge — for the final install-CTA clip. */
  showPlayStoreBadge?: boolean;
  /**
   * Corner for the title chip — default top-left. Override to top-right for
   * clips whose recorded content itself renders something in the top-left
   * corner (e.g. the PWA install card), so the chip doesn't sit on top of it.
   */
  titleCorner?: 'top-left' | 'top-right';
};

// HASHPASS app walkthrough / tutorial — core basics first: landing, sign up
// (OTP or email magic link), into the dashboard, updating the attendee
// profile, then browsing events/speakers. Google sign-in and meeting-request
// are follow-ups once this core path is recorded — see flows/ for all of
// them. Record each with `pnpm --filter hashpass-video-studio record:web`,
// using the matching flow script in apps/video-studio/flows/ (README.md has
// the exact commands, including carrying an authenticated session from the
// sign-in recording into the dashboard recordings).
export const appTutorialStepsEn: ClipSlot[] = [
  {src: 'landing/hero.webm', title: 'Landing page', caption: 'hashpass.tech/home', trimStartSeconds: 9},
  {
    src: 'auth/otp/sign-in-form.webm',
    title: 'Sign up — OTP or magic link',
    caption: 'Email sign-in',
    trimStartSeconds: 8,
  },
  {src: 'dashboard/explore.webm', title: 'Enter the dashboard', caption: 'Post-login explore', trimStartSeconds: 3},
  {
    src: 'dashboard/profile-update.webm',
    title: 'Update attendee profile',
    caption: 'Role & company',
    trimStartSeconds: 4,
  },
  {
    src: 'dashboard/speakers/browse-events.webm',
    title: 'Browse events & speakers',
    trimStartSeconds: 5,
  },
  {
    src: 'pwa/install.webm',
    title: 'Install as an app',
    caption: 'Add to your home screen',
    trimStartSeconds: 5,
    showPlayStoreBadge: true,
    titleCorner: 'top-right',
  },
];

// Same tutorial, recorded with the browser context locale set to es-ES (see
// packages/tools/scripts/record-web-demo.mjs's --locale flag) — the app's
// own i18n (apps/mobile-app/i18n/i18n.ts) picks up the browser locale on
// load, no in-app language switch needed. One real gap: the attendee
// profile screen (app/(shared)/dashboard/profile.tsx) hardcodes its English
// strings rather than using the i18n t() helper, so that clip's on-screen
// chrome ("Attendee Information", "Edit Attendee Information", etc.) stays
// English even here — a real characteristic of the current app, not a
// recording bug. Titles/captions below are translated regardless, since
// those are this composition's own text, not the recorded app's.
export const appTutorialStepsEs: ClipSlot[] = [
  {src: 'landing/hero-es.webm', title: 'Página de inicio', caption: 'hashpass.tech/home', trimStartSeconds: 9},
  {
    src: 'auth/otp/sign-in-form-es.webm',
    title: 'Registro — OTP o enlace mágico',
    caption: 'Inicio de sesión por correo',
    trimStartSeconds: 4,
  },
  {
    src: 'dashboard/explore-es.webm',
    title: 'Entrar al panel',
    caption: 'Explorador tras iniciar sesión',
    trimStartSeconds: 3,
  },
  {
    src: 'dashboard/profile-update-es.webm',
    title: 'Actualizar perfil de asistente',
    caption: 'Rol y empresa',
    trimStartSeconds: 5,
  },
  {
    src: 'dashboard/speakers/browse-events-es.webm',
    title: 'Explorar eventos y oradores',
    trimStartSeconds: 3,
  },
  {
    src: 'pwa/install-es.webm',
    title: 'Instalar como app',
    caption: 'Añádela a tu pantalla de inicio',
    trimStartSeconds: 5,
    showPlayStoreBadge: true,
    titleCorner: 'top-right',
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
    // Re-recorded fresh (the original capture this composition shipped
    // with was lost from the gitignored public/recordings/ cache) — real
    // content doesn't paint until ~8-9s in, same app-boot-splash lead-in
    // documented above.
    trimStartSeconds: 8,
  },
  {
    src: 'bsl/agenda-browse.webm',
    title: 'BSL On Tour hero + agenda browse',
    trimStartSeconds: 8,
  },
  {
    src: 'bsl/meeting-request.webm',
    title: 'Meeting request & schedule',
    caption: 'Networking, chile2026',
    // Real content (the speaker list) doesn't paint until ~8s in — the
    // recording's own flow (flows/bsl-meeting-request.mjs) spends its first
    // several seconds on app boot + the profile page's client-side
    // pass/entitlement check before "Request Meeting" even appears.
    trimStartSeconds: 8,
  },
];
