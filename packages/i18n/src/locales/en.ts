export const en = {
  nav: {
    features: 'Features',
    pricing: 'Pricing',
    docs: 'Docs',
    getStarted: 'Get started',
    signIn: 'Sign in',
    signInWith: 'Sign in with HASHPASS',
    scanQr: 'Scan with the HASHPASS.tech app',
    orContinue: 'or continue on web',
    openApp: 'Open HASHPASS',
    downloadApp: 'Download the app',
  },
  hero: {
    badge: 'Membership infrastructure',
    title: 'Your club.\nCommanded.',
    subtitle:
      'HASHPASS gives invite-only clubs, communities, and events a unified platform to manage members, access, and renewals — across mobile and web.',
    ctaPrimary: 'Request a walkthrough',
    ctaSecondary: 'Explore operations',
    scrollDown: 'Scroll',
    scrollUp: 'Top',
  },
  download: {
    badge: 'Available now',
    title: 'Your next experience is one tap away.',
    description: 'Keep your passes, communities, and event connections with you. Download HASHPASS free on Android.',
    getItOn: 'Get it on',
    googlePlay: 'Google Play',
    googlePlayAriaLabel: 'Get HASHPASS on Google Play',
    downloadHashpass: 'Download HASHPASS',
    downloadAriaLabel: 'Download HASHPASS from Google Play',
  },
  stats: {
    activeMembers: 'Active members',
    activeMembersValue: '2,418',
    uptime: 'Access uptime',
    uptimeValue: '99.98%',
    syncTime: 'Sync time',
    syncTimeValue: '<100ms',
    clubs: 'Clubs onboarded',
    clubsValue: '34',
  },
  features: {
    eyebrow: 'What you get',
    title: 'Everything your club needs',
    subtitle:
      'From invitations to renewals, HASHPASS handles the full membership lifecycle so you can focus on building community.',
    identity: {
      title: 'Identity management',
      description:
        'Invites, approvals, recovery, and role states all live in one unified model.',
    },
    billing: {
      title: 'Billing & renewals',
      description:
        'Renewals, invoice states, grace periods, and upgrades stay visible and automatic.',
    },
    access: {
      title: 'Real-time access',
      description:
        'Event entry, perks, and admin tools all read from the same entitlement source.',
    },
    operations: {
      title: 'Operations center',
      description:
        'At a glance, the team sees who is joining, who needs renewal, and which accounts require review.',
    },
    multiplatform: {
      title: 'Multi-platform',
      description:
        'The same design language flows across mobile and web without duplicating core components.',
    },
    blockchain: {
      title: 'Blockchain-verified',
      description:
        'NFT tickets and tokens give members verifiable proof of membership and event attendance.',
    },
  },
  operations: {
    eyebrow: 'Operations',
    title: 'A queue members and admins can both understand',
    description:
      'At a glance, the team sees who is joining, who needs a renewal, and which accounts require manual review.',
    badge: 'Realtime sync on',
    applicationsTitle: 'Applications in review',
    applicationsDescription:
      'New members and invite requests are triaged with clear status labels.',
    renewalsTitle: 'Renewals and billing',
    renewalsDescription:
      'Subscription state, grace periods, and billing reminders are always visible.',
  },
  cta: {
    eyebrow: 'Ready to start?',
    title: 'Command your membership from day one.',
    subtitle:
      'Join clubs already running on HASHPASS. One platform for every stage of the member journey.',
    primary: 'Request a walkthrough',
    secondary: 'Read the docs',
    email: 'hello@hashpass.club',
  },
  footer: {
    tagline: 'Membership infrastructure for modern clubs.',
    product: 'Product',
    company: 'Company',
    legal: 'Legal',
    features: 'Features',
    pricing: 'Pricing',
    docs: 'Docs',
    status: 'Status',
    about: 'About',
    blog: 'Blog',
    privacy: 'Privacy',
    terms: 'Terms',
    copyright: '© {year} HASHPASS. All rights reserved.',
  },
  theme: {
    toggle: 'Toggle theme',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
  },
  lang: {
    select: 'Language',
    en: 'English',
    es: 'Español',
    ko: '한국어',
    fr: 'Français',
    pt: 'Português',
    de: 'Deutsch',
  },
  demo: {
    eyebrow: 'See it in action',
    title: 'Watch HASHPASS in action',
    subtitle:
      'A full walkthrough of the app, screen by screen — from landing page to installing HASHPASS on your home screen.',
    withNarration: 'With narration',
    silent: 'Silent',
    chapters: 'Chapters',
    appTutorialTitle: 'App walkthrough',
    appTutorialSubtitle: 'Landing, sign-up, dashboard, profile, events, and installing the app',
    bslShowcaseTitle: 'BSL On Tour showcase',
    bslShowcaseSubtitle: 'The event platform in action at Blockchain Summit Latam',
    chapterLanding: 'Landing page',
    chapterSignUp: 'Sign up — OTP or magic link',
    chapterDashboard: 'Enter the dashboard',
    chapterProfile: 'Update attendee profile',
    chapterEvents: 'Browse events & speakers',
    chapterPwa: 'Install as an app',
  },
} as const;

export type EnMessages = typeof en;
