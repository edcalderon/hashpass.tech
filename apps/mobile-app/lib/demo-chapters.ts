// Chapter seek-points for the /demo page's app-tutorial videos. Computed
// from the real recording durations (minus each clip's trimStartSeconds)
// plus the 3s intro bumper — see
// apps/video-studio/src/content/clips.ts for the source values and
// apps/video-studio/src/lib/clip-layout.ts for the same math Remotion
// uses when it renders the actual composition. Both language cuts (silent
// and narrated) share identical timing since narration audio was sized to
// fit inside each clip's existing duration, not the other way around, so
// one chapter list works for all four App Tutorial videos.
export type DemoChapter = {
  slug: string;
  titleKey: string;
  startSeconds: number;
};

export const demoChaptersEn: DemoChapter[] = [
  { slug: 'landing', titleKey: 'chapterLanding', startSeconds: 3 },
  { slug: 'sign-up', titleKey: 'chapterSignUp', startSeconds: 14.72 },
  { slug: 'dashboard', titleKey: 'chapterDashboard', startSeconds: 23.24 },
  { slug: 'profile', titleKey: 'chapterProfile', startSeconds: 36.84 },
  { slug: 'events', titleKey: 'chapterEvents', startSeconds: 45.72 },
  { slug: 'pwa', titleKey: 'chapterPwa', startSeconds: 61.28 },
];

export const demoChaptersEs: DemoChapter[] = [
  { slug: 'landing', titleKey: 'chapterLanding', startSeconds: 3 },
  { slug: 'sign-up', titleKey: 'chapterSignUp', startSeconds: 17.24 },
  { slug: 'dashboard', titleKey: 'chapterDashboard', startSeconds: 26.2 },
  { slug: 'profile', titleKey: 'chapterProfile', startSeconds: 39.76 },
  { slug: 'events', titleKey: 'chapterEvents', startSeconds: 48.8 },
  { slug: 'pwa', titleKey: 'chapterPwa', startSeconds: 65.12 },
];

export type DemoVideoLocale = 'en' | 'es';

// Served from the target-account S3 bucket that already hosts event media
// (chile2026 speaker photos, etc.) for real CDN-grade loading rather than
// bundled through the app's own web server — see
// events/hashpass/demo-videos/ and events/chile2026/demo-videos/ under
// hashpass-production-event-media-952191196420-us-east-2. The bucket's
// public-read policy only covers the `events/*` prefix, so the general
// (non-event-specific) app-tutorial assets live under a `hashpass`
// pseudo-event folder rather than their own top-level prefix, so as not to
// need a bucket-policy change for this.
const EVENT_MEDIA_BASE = 'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events';

export const demoVideoSources = {
  en: {
    narrated: `${EVENT_MEDIA_BASE}/hashpass/demo-videos/app-tutorial-narrated-en.mp4`,
    silent: `${EVENT_MEDIA_BASE}/hashpass/demo-videos/app-tutorial-en.mp4`,
    poster: `${EVENT_MEDIA_BASE}/hashpass/demo-posters/app-tutorial-en.jpg`,
  },
  es: {
    narrated: `${EVENT_MEDIA_BASE}/hashpass/demo-videos/app-tutorial-narrated-es.mp4`,
    silent: `${EVENT_MEDIA_BASE}/hashpass/demo-videos/app-tutorial-es.mp4`,
    poster: `${EVENT_MEDIA_BASE}/hashpass/demo-posters/app-tutorial-es.jpg`,
  },
} as const;

// BslShowcaseNarrated dubs the same single (English-UI) recording for both
// narrated locales rather than separate en/es captures — see Root.tsx's
// BslShowcaseNarratedEN/ES comment — so, unlike demoChaptersEn/Es above,
// one chapter list covers both languages.
export const bslChapters: DemoChapter[] = [
  { slug: 'bsl-event-landing', titleKey: 'bslChapterEventLanding', startSeconds: 3 },
  { slug: 'bsl-agenda-browse', titleKey: 'bslChapterAgendaBrowse', startSeconds: 13.48 },
  { slug: 'bsl-meeting-request', titleKey: 'bslChapterMeetingRequest', startSeconds: 23.88 },
];

export const demoBslShowcase = {
  en: {
    narrated: `${EVENT_MEDIA_BASE}/chile2026/demo-videos/bsl-showcase-narrated-en.mp4`,
    silent: `${EVENT_MEDIA_BASE}/chile2026/demo-videos/bsl-showcase.mp4`,
    poster: `${EVENT_MEDIA_BASE}/chile2026/demo-posters/bsl-showcase.jpg`,
  },
  es: {
    narrated: `${EVENT_MEDIA_BASE}/chile2026/demo-videos/bsl-showcase-narrated-es.mp4`,
    silent: `${EVENT_MEDIA_BASE}/chile2026/demo-videos/bsl-showcase.mp4`,
    poster: `${EVENT_MEDIA_BASE}/chile2026/demo-posters/bsl-showcase.jpg`,
  },
} as const;
