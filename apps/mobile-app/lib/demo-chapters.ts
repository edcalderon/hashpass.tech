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

export const demoVideoSources = {
  en: {
    narrated: '/demo/videos/app-tutorial-narrated-en.mp4',
    silent: '/demo/videos/app-tutorial-en.mp4',
    poster: '/demo/posters/app-tutorial-en.jpg',
  },
  es: {
    narrated: '/demo/videos/app-tutorial-narrated-es.mp4',
    silent: '/demo/videos/app-tutorial-es.mp4',
    poster: '/demo/posters/app-tutorial-es.jpg',
  },
} as const;

export const demoBslShowcase = {
  src: '/demo/videos/bsl-showcase.mp4',
  poster: '/demo/posters/bsl-showcase.jpg',
};
