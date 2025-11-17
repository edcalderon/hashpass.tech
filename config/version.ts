// Version Configuration for BSL 2025 HashPass App
// Semantic Versioning: MAJOR.MINOR.PATCH

import packageJson from '../package.json';

export interface VersionInfo {
  version: string;
  buildNumber: number;
  releaseDate: string;
  releaseType: 'stable' | 'beta' | 'rc' | 'alpha';
  environment: 'development' | 'staging' | 'production';
  features: string[];
  bugfixes: string[];
  breakingChanges: string[];
  notes: string;
}

export interface VersionHistory {
  [version: string]: VersionInfo;
}

// Current Version Configuration - Auto-synced with package.json
export const CURRENT_VERSION: VersionInfo = {
  version: packageJson.version, // Single source of truth: package.json
  buildNumber: 202511171753, // Updated to current timestamp
  releaseDate: '2025-11-17',
  releaseType: 'beta',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  features: [],
  bugfixes: [
    'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
    'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
    'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
    'Fixed Supabase session detection conflicts with manual OAuth callback handling',
    'Improved auth flow reliability with better error handling and debugging'
  ],
  breakingChanges: [],
  notes: 'Version 1.6.105 release'
};

// Version History
export const VERSION_HISTORY: VersionHistory = {
  '1.6.105': {
    version: '1.6.105',
    buildNumber: 202511171753,
    releaseDate: '2025-11-17',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.105 release'
  },
  '1.6.104': {
    version: '1.6.104',
    buildNumber: 202511171734,
    releaseDate: '2025-11-17',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.104 release'
  },
  '1.6.103': {
    version: '1.6.103',
    buildNumber: 202511170148,
    releaseDate: '2025-11-17',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.103 release'
  },
  '1.6.102': {
    version: '1.6.102',
    buildNumber: 202511161830,
    releaseDate: '2025-11-16',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Fixed'
  },
  '1.6.101': {
    version: '1.6.101',
    buildNumber: 202511152100,
    releaseDate: '2025-11-15',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Fixed'
  },
  '1.6.100': {
    version: '1.6.100',
    buildNumber: 202511152034,
    releaseDate: '2025-11-15',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Fixed'
  },
  '1.6.99': {
    version: '1.6.99',
    buildNumber: 202511152006,
    releaseDate: '2025-11-15',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Integrated'
  },
  '1.6.98': {
    version: '1.6.98',
    buildNumber: 202511151921,
    releaseDate: '2025-11-15',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Event'
  },
  '1.6.97': {
    version: '1.6.97',
    buildNumber: 202511141248,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.97 release'
  },
  '1.6.96': {
    version: '1.6.96',
    buildNumber: 202511141246,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.96 release'
  },
  '1.6.95': {
    version: '1.6.95',
    buildNumber: 202511141225,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.95 release'
  },
  '1.6.94': {
    version: '1.6.94',
    buildNumber: 202511141207,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.94 release'
  },
  '1.6.93': {
    version: '1.6.93',
    buildNumber: 202511141147,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.93 release'
  },
  '1.6.92': {
    version: '1.6.92',
    buildNumber: 202511141100,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Fixed auth login redirect loop on production by disabling detectSessionInUrl on web',
      'Optimized session verification timing - reduced from 7+ seconds to 2 seconds',
      'Added redirect throttling to prevent rapid redirect loops (5-second minimum)',
      'Fixed Supabase session detection conflicts with manual OAuth callback handling',
      'Improved auth flow reliability with better error handling and debugging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.92 release - Auth login loop fixes and optimizations'
  },
  '1.6.90': {
    version: '1.6.90',
    buildNumber: 202511141000,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.90 release'
  },
  '1.6.88': {
    version: '1.6.88',
    buildNumber: 202511140839,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.88 release'
  },
  '1.6.87': {
    version: '1.6.87',
    buildNumber: 202511140756,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.87 release'
  },
  '1.6.86': {
    version: '1.6.86',
    buildNumber: 202511140650,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.86 release'
  },
  '1.6.85': {
    version: '1.6.85',
    buildNumber: 202511140626,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.85 release'
  },
  '1.6.84': {
    version: '1.6.84',
    buildNumber: 202511140509,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.84 release'
  },
  '1.6.83': {
    version: '1.6.83',
    buildNumber: 202511140507,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.83 release'
  },
  '1.6.82': {
    version: '1.6.82',
    buildNumber: 202511140006,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Fixed infinite redirect loop in OAuth callback handler',
      'Added safeNavigate helper to prevent redirecting to callback route',
      'Enhanced getRedirectPath to reject callback route redirects',
      'Fixed OAuth redirect detection to only trigger on wrong domain (auth.hashpass.co)',
      'Added redirect loop prevention checks in all navigation paths'
    ],
    breakingChanges: [],
    notes: 'Fixed OAuth infinite redirect loop on production'
  },
  '1.6.81': {
    version: '1.6.81',
    buildNumber: 202511140404,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Updated welcome email logic to use email tracking flag (user_email_tracking table) instead of user creation date check',
      'Fixed welcome email being sent to existing users by checking database flag instead of 24-hour creation window'
    ],
    breakingChanges: [],
    notes: 'Updated'
  },
  '1.6.80': {
    version: '1.6.80',
    buildNumber: 202511140402,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Updated welcome email logic to use email tracking flag (user_email_tracking table) instead of user creation date check',
      'Fixed welcome email being sent to existing users by checking database flag instead of 24-hour creation window'
    ],
    breakingChanges: [],
    notes: 'Updated welcome email logic to use email tracking flag instead of user creation date check'
  },
  '1.6.79': {
    version: '1.6.79',
    buildNumber: 202511140142,
    releaseDate: '2025-11-14',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.79 release'
  },
  '1.6.78': {
    version: '1.6.78',
    buildNumber: 202511132154,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.78 release'
  },
  '1.6.77': {
    version: '1.6.77',
    buildNumber: 202511132133,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.77 release'
  },
  '1.6.76': {
    version: '1.6.76',
    buildNumber: 202511132114,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.76 release'
  },
  '1.6.73': {
    version: '1.6.73',
    buildNumber: 202511131938,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.73 release'
  },
  '1.6.72': {
    version: '1.6.72',
    buildNumber: 202511131925,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.72 release'
  },
  '1.6.71': {
    version: '1.6.71',
    buildNumber: 202511131845,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.71 release'
  },
  '1.6.70': {
    version: '1.6.70',
    buildNumber: 202511131825,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.70 release'
  },
  '1.6.69': {
    version: '1.6.69',
    buildNumber: 202511131746,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.69 release'
  },
  '1.6.68': {
    version: '1.6.68',
    buildNumber: 202511131739,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.68 release'
  },
  '1.6.67': {
    version: '1.6.67',
    buildNumber: 202511131712,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.67 release'
  },
  '1.6.65': {
    version: '1.6.65',
    buildNumber: 202511131611,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.65 release'
  },
  '1.6.64': {
    version: '1.6.64',
    buildNumber: 202511131557,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from ',
      'Fixed meeting status showing ',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.64 release'
  },
  '1.6.62': {
    version: '1.6.62',
    buildNumber: 202511131200,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    features: [
      'Added requester information display in meeting details (name, avatar, title, company)',
      'Moved chat title to navigation bar for better UX',
      'Improved meeting status display with proper status handling (confirmed, tentative, etc.)'
    ],
    bugfixes: [
      'Fixed chat avatar always showing speaker avatar correctly',
      'Fixed meeting detail title from "Meeting Request Details" to "Meeting Details"',
      'Fixed meeting status showing "TENTATIVE" when meetings are actually "CONFIRMED"',
      'Updated meetings in database from tentative to confirmed status for accepted requests',
      'Fixed meeting status color and icon mapping for all meeting statuses',
      'Fixed requester information not displaying in meeting details'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.62 release - Meeting details improvements and chat UI fixes'
  },
  '1.6.61': {
    version: '1.6.61',
    buildNumber: 202511130935,
    releaseDate: '2025-11-13',
    releaseType: 'beta',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    features: [
      'Added chat last seen tracking system - tracks when users view meeting chats',
      'Added automatic notifications for incoming chat messages (only when user is not actively viewing)',
      'Added chat header with participant info, avatar, and last seen status',
      'Added online indicator (green dot) for active participants',
      'Improved chat UI with better message bubble styling and spacing',
      'Added empty state for chat when no messages exist'
    ],
    bugfixes: [
      'Fixed avatar display issues - corrected avatar assignment for own vs incoming messages',
      'Fixed message positioning and alignment in chat bubbles',
      'Fixed realtime notifications not appearing in notification center',
      'Fixed missing useNotifications import causing runtime error',
      'Improved message duplicate detection and removal',
      'Enhanced message bubble styling with better borders and shadows'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.61 release - Chat improvements with last seen tracking, notifications, and enhanced UI'
  },
  '1.6.60': {
    version: '1.6.60',
    buildNumber: 202511121828,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added active speaker badges to all speaker cards (green dot + Active label)',
      'Added active speakers filter in unified filter component',
      'Added active speakers count to EventBanner subtitle'
    ],
    bugfixes: [
      'Fixed speaker avatar loading logic - simplified conditions for better reliability',
      'Improved image loading UX - shows with 0.5 opacity while loading',
      'Fixed avatar component state management - removed blocking conditions',
      'Improved speaker card design - better shadows, typography, and spacing',
      'Fixed Metro middleware asset serving with debug logging'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.60 release - Active speaker badges, improved avatar loading, and enhanced UI'
  },
  '1.6.59': {
    version: '1.6.59',
    buildNumber: 202511121744,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Fixed speaker avatar loading to show loader first, then fallback to initials',
      'Fixed Metro middleware to allow Expo asset requests (fonts) to pass through',
      'Improved avatar loading state management - only show loader when URLs are available',
      'Fixed avatar component to properly normalize imageUrl (null/undefined/empty string handling)',
      'Fixed Metro asset resolver to distinguish between Expo assets and custom assets',
      'Added support for font file types (.ttf, .woff, .woff2) in Metro middleware'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.59 release - Avatar loading improvements and Metro asset handling fixes'
  },
  '1.6.58': {
    version: '1.6.58',
    buildNumber: 202511121726,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Fixed avatar loading stuck on loading state',
      'Fixed infinite loop in SpeakerAvatar component (Maximum update depth exceeded)',
      'Fixed Metro asset resolver trying to scan wrong directory for /assets/ requests',
      'Improved avatar loading logic with proper state management and refs',
      'Fixed onLoad/onError callbacks not firing by always rendering Image component',
      'Added loadSuccessRef to track successful image loads',
      'Fixed Metro middleware to handle /assets/ requests before asset resolver',
      'Improved error handling and fallback logic for avatar loading'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.58 release - Avatar loading fixes and Metro configuration improvements'
  },
  '1.6.57': {
    version: '1.6.57',
    buildNumber: 202511122205,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.57 release'
  },
  '1.6.56': {
    version: '1.6.56',
    buildNumber: 202511122157,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.56 release'
  },
  '1.6.55': {
    version: '1.6.55',
    buildNumber: 202511122142,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.55 release'
  },
  '1.6.54': {
    version: '1.6.54',
    buildNumber: 202511122138,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.54 release'
  },
  '1.6.53': {
    version: '1.6.53',
    buildNumber: 202511122104,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.53 release'
  },
  '1.6.52': {
    version: '1.6.52',
    buildNumber: 202511122042,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.52 release'
  },
  '1.6.51': {
    version: '1.6.51',
    buildNumber: 202511122033,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      // No new features
    ],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.51 release'
  },
  '1.6.50': {
    version: '1.6.50',
    buildNumber: 202511121501,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [],
    bugfixes: [
      'Fixed OTP verification redirect issue on production',
      'Added session verification before navigation after OTP verification',
      'Improved redirect timing to ensure session is fully established',
      'Added proper loading state management during OTP verification'
    ],
    breakingChanges: [],
    notes: 'Fixed OTP authentication redirect issue on production'
  },
  '1.6.49': {
    version: '1.6.49',
    buildNumber: 202511121924,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.49 release'
  },
  '1.6.48': {
    version: '1.6.48',
    buildNumber: 202511121902,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.48 release'
  },
  '1.6.47': {
    version: '1.6.47',
    buildNumber: 202511121745,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.47 release'
  },
  '1.6.46': {
    version: '1.6.46',
    buildNumber: 202511121704,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.46 release'
  },
  '1.6.45': {
    version: '1.6.45',
    buildNumber: 202511121456,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.45 release'
  },
  '1.6.44': {
    version: '1.6.44',
    buildNumber: 202511121434,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.44 release'
  },
  '1.6.43': {
    version: '1.6.43',
    buildNumber: 202511121339,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.43 release'
  },
  '1.6.42': {
    version: '1.6.42',
    buildNumber: 202511121336,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.42 release'
  },
  '1.6.41': {
    version: '1.6.41',
    buildNumber: 202511121314,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.41 release'
  },
  '1.6.40': {
    version: '1.6.40',
    buildNumber: 202511121310,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.40 release'
  },
  '1.6.39': {
    version: '1.6.39',
    buildNumber: 202511121245,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.39 release'
  },
  '1.6.38': {
    version: '1.6.38',
    buildNumber: 202511121240,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.38 release'
  },
  '1.6.37': {
    version: '1.6.37',
    buildNumber: 202511121223,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.37 release'
  },
  '1.6.36': {
    version: '1.6.36',
    buildNumber: 202511120912,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Refactored version system to use version.ts as single source of truth',
      'Updated versionService to read directly from version.ts instead of versions.json',
      'Improved version display accuracy in sidebar'
    ],
    bugfixes: [
      'Fixed sidebar version display showing stale/incorrect data',
      'Fixed versionService reading from outdated versions.json file',
      'Ensured version display always shows current version from source of truth'
    ],
    breakingChanges: [],
    notes: 'Fixed version display system and established single source of truth'
  },
  '1.6.35': {
    version: '1.6.35',
    buildNumber: 202511120857,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.35 release'
  },
  '1.6.34': {
    version: '1.6.34',
    buildNumber: 202511120834,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.34 release'
  },
  '1.6.33': {
    version: '1.6.33',
    buildNumber: 202511120823,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.33 release'
  },
  '1.6.32': {
    version: '1.6.32',
    buildNumber: 202511120758,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.32 release'
  },
  '1.6.31': {
    version: '1.6.31',
    buildNumber: 202511120733,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.31 release'
  },
  '1.6.30': {
    version: '1.6.30',
    buildNumber: 202511120648,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.30 release'
  },
  '1.6.29': {
    version: '1.6.29',
    buildNumber: 202511120601,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.29 release'
  },
  '1.6.28': {
    version: '1.6.28',
    buildNumber: 202511120547,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.28 release'
  },
  '1.6.26': {
    version: '1.6.26',
    buildNumber: 202511120547,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.26 release'
  },
  '1.6.25': {
    version: '1.6.25',
    buildNumber: 202511120545,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.25 release'
  },
  '1.6.27': {
    version: '1.6.27',
    buildNumber: 202511120508,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.27 release'
  },
'1.6.23': {
    version: '1.6.23',
    buildNumber: 202511120431,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.23 release'
  },
'1.6.24': {
    version: '1.6.24',
    buildNumber: 202511120416,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.24 release'
  },
'1.6.22': {
    version: '1.6.22',
    buildNumber: 202511120256,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.22 release'
  },
  '1.6.21': {
    version: '1.6.21',
    buildNumber: 202511120045,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.21 release'
  },
  '1.6.20': {
    version: '1.6.20',
    buildNumber: 202511120030,
    releaseDate: '2025-11-12',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.20 release'
  },
  '1.6.19': {
    version: '1.6.19',
    buildNumber: 202511112015,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.19 release'
  },
  '1.6.18': {
    version: '1.6.18',
    buildNumber: 202511111958,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.18 release'
  },
  '1.6.17': {
    version: '1.6.17',
    buildNumber: 202511111952,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.17 release'
  },
  '1.6.16': {
    version: '1.6.16',
    buildNumber: 202511111952,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.16 release'
  },
  '1.6.14': {
    version: '1.6.14',
    buildNumber: 202511110654,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.14 release'
  },
  '1.6.13': {
    version: '1.6.13',
    buildNumber: 202511110640,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.13 release'
  },
  '1.6.12': {
    version: '1.6.12',
    buildNumber: 202511110614,
    releaseDate: '2025-11-11',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.12 release'
  },
  '1.6.11': {
    version: '1.6.11',
    buildNumber: 202511102042,
    releaseDate: '2025-11-10',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.11 release'
  },
  '1.6.10': {
    version: '1.6.10',
    buildNumber: 202511101904,
    releaseDate: '2025-11-10',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.10 release'
  },
  '1.6.9': {
    version: '1.6.9',
    buildNumber: 202511101015,
    releaseDate: '2025-11-10',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.9 release'
  },
  '1.6.8': {
    version: '1.6.8',
    buildNumber: 202511100828,
    releaseDate: '2025-11-10',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.8 release'
  },
  '1.6.7': {
    version: '1.6.7',
    buildNumber: 202511092344,
    releaseDate: '2025-11-09',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Storybook'
  },
  '1.6.6': {
    version: '1.6.6',
    buildNumber: 202511092132,
    releaseDate: '2025-11-09',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.6 release'
  },
  '1.6.5': {
    version: '1.6.5',
    buildNumber: 202511081641,
    releaseDate: '2025-11-08',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.5 release'
  },
  '1.6.4': {
    version: '1.6.4',
    buildNumber: 202511080702,
    releaseDate: '2025-11-08',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.4 release'
  },
  '1.6.3': {
    version: '1.6.3',
    buildNumber: 202511072207,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.3 release'
  },
  '1.6.2': {
    version: '1.6.2',
    buildNumber: 202511072038,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.2 release'
  },
  '1.6.1': {
    version: '1.6.1',
    buildNumber: 202511072036,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.1 release'
  },
  '1.6.0': {
    version: '1.6.0',
    buildNumber: 202511070811,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Version 1.6.0 release'
  },
  '1.5.16': {
    version: '1.5.16',
    buildNumber: 202511070644,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Added email provider detection with clickable links in toasts, fixed pass creation for deleted users, improved delete account flow with OTP verification, fixed cancel meeting request function, and updated meeting request labels in speaker view'
  },
  '1.5.15': {
    version: '1.5.15',
    buildNumber: 202511070329,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Fixed blocked users loading issue, improved dark mode contrast, added mute functionality, and fixed duplicate navigation bar'
  },
  '1.5.14': {
    version: '1.5.14',
    buildNumber: 202511070301,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Removed tutorial buttons from explore and networking screens, tutorials now auto-start automatically'
  },
  '1.5.13': {
    version: '1.5.13',
    buildNumber: 202511070249,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Improved toast styling to match theme colors and enhance text contrast'
  },
'1.5.12': {
    version: '1.5.12',
    buildNumber: 202511070059,
    releaseDate: '2025-11-07',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Added Privacy/Terms modal component for in-app viewing',
      'Improved mobile responsiveness for theme/language switcher on auth page'
    ],
    bugfixes: [
      'Fixed theme and language switcher overlapping with auth card on mobile views',
      'Replaced navigation with modal for privacy and terms links on auth screen'
    ],
    breakingChanges: [],
    notes: 'Fixed mobile overlap issue and added privacy/terms modal'
  },
  '1.5.11': {
    version: '1.5.11',
    buildNumber: 202511062244,
    releaseDate: '2025-11-06',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.11 release'
  },
  '1.5.9': {
    version: '1.5.9',
    buildNumber: 202511062041,
    releaseDate: '2025-11-06',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.9 release'
  },
  '1.5.8': {
    version: '1.5.8',
    buildNumber: 202511061859,
    releaseDate: '2025-11-06',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.8 release'
  },
  '1.5.7': {
    version: '1.5.7',
    buildNumber: 202511061751,
    releaseDate: '2025-11-06',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.7 release'
  },
  '1.5.6': {
    version: '1.5.6',
    buildNumber: 202511052256,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.6 release'
  },
  '1.5.5': {
    version: '1.5.5',
    buildNumber: 202511052229,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.5 release'
  },
  '1.5.4': {
    version: '1.5.4',
    buildNumber: 202511050332,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.4 release'
  },
  '1.5.3': {
    version: '1.5.3',
    buildNumber: 202511050324,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.3 release'
  },
  '1.5.2': {
    version: '1.5.2',
    buildNumber: 202511050316,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.2 release'
  },
  '1.5.1': {
    version: '1.5.1',
    buildNumber: 202511050304,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.1 release'
  },
  '1.5.0': {
    version: '1.5.0',
    buildNumber: 202511050249,
    releaseDate: '2025-11-05',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.5.0 release'
  },
  '1.4.9': {
    version: '1.4.9',
    buildNumber: 202511041603,
    releaseDate: '2025-11-04',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Improved language switching with smooth updates without remounting',
      'Enhanced I18nProvider to handle locale changes reactively',
      'Added useLingui hook to explore component for proper translation updates'
    ],
    bugfixes: [
      'Fixed language switching not updating explorer section immediately',
      'Fixed locale changes requiring page reload to see translations',
      'Improved translation reactivity without component remounting'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.9 release - Improved language switching experience'
  },
  '1.4.8': {
    version: '1.4.8',
    buildNumber: 202511040915,
    releaseDate: '2025-11-04',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.8 release'
  },
  '1.4.7': {
    version: '1.4.7',
    buildNumber: 202511030135,
    releaseDate: '2025-11-03',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.7 release'
  },
  '1.4.6': {
    version: '1.4.6',
    buildNumber: 202511022340,
    releaseDate: '2025-11-02',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.6 release'
  },
  '1.4.4': {
    version: '1.4.4',
    buildNumber: 202511020451,
    releaseDate: '2025-11-02',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.4 release'
  },
  '1.4.3': {
    version: '1.4.3',
    buildNumber: 202511020310,
    releaseDate: '2025-11-02',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.3 release'
  },
  '1.4.2': {
    version: '1.4.2',
    buildNumber: 202511012207,
    releaseDate: '2025-11-01',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'HashPass logo clickable with zoom animation - navigates to home page',
      'Mouse wheel scroll support for Quick Access section on explore page',
      'Snap-to-interval scrolling for Quick Access cards matching networking center behavior'
    ],
    bugfixes: [
      'Fixed admin status check error (PGRST116) - multiple rows returned issue',
      'Fixed QR code authentication error - wait for auth to finish loading',
      'Fixed arrow button scrolling on small viewports in Quick Access section',
      'Fixed HashPass logo card background to not be affected by sidebar animation'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.2 release - UI improvements and bug fixes'
  },
  '1.4.1': {
    version: '1.4.1',
    buildNumber: 202511020246,
    releaseDate: '2025-11-02',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Unified LoadingScreen component for consistent loading states across the app',
      'Integrated LoadingScreen in networking, agenda, and speakers screens',
      'Global loader implementation for agenda screen to prevent banner expansion issues'
    ],
    bugfixes: [
      'Fixed LoadingScreen subtitle undefined error in getStyles function',
      'Fixed agenda banner expansion issue during initial loading',
      'Fixed missing LoadingScreen import in speakers calendar component',
      'Fixed loader not showing at beginning of agenda screen causing banner to expand'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.1 release'
  },
  '1.4.0': {
    version: '1.4.0',
    buildNumber: 202511020054,
    releaseDate: '2025-11-02',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Unified LoadingScreen component for consistent loading states across the app',
      'Integrated LoadingScreen in networking, agenda, and speakers screens',
      'Global loader implementation for agenda screen to prevent banner expansion issues'
    ],
    bugfixes: [
      'Fixed LoadingScreen subtitle undefined error in getStyles function',
      'Fixed agenda banner expansion issue during initial loading',
      'Fixed missing LoadingScreen import in speakers calendar component',
      'Fixed loader not showing at beginning of agenda screen causing banner to expand'
    ],
    breakingChanges: [],
    notes: 'Version 1.4.0 release'
  },
'1.3.9': {
    version: '1.3.9',
    buildNumber: 202510310833,
    releaseDate: '2025-10-31',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Unified LoadingScreen component for consistent loading states across the app',
      'Integrated LoadingScreen in networking, agenda, and speakers screens',
      'Global loader implementation for agenda screen to prevent banner expansion issues'
    ],
    bugfixes: [
      'Fixed LoadingScreen subtitle undefined error in getStyles function',
      'Fixed agenda banner expansion issue during initial loading',
      'Fixed missing LoadingScreen import in speakers calendar component',
      'Fixed loader not showing at beginning of agenda screen causing banner to expand'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.9 release - Unified loading experience across all screens'
  },
  '1.3.8': {
    version: '1.3.8',
    buildNumber: 202510310801,
    releaseDate: '2025-10-31',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'User pass management system',
      'BSL 2025 event integration',
      'Speaker profile system with avatars',
      'Event agenda with live updates',
      'Unified search and filter system',
      'Dark mode support',
      'Event banner component',
      'Pass card UI with BSL branding',
      'Agenda tabbed interface',
      'Real-time countdown system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues',
      'Resolved TypeScript undefined property errors',
      'Fixed agenda data grouping logic',
      'Corrected speaker count discrepancies',
      'Fixed dark mode contrast issues',
      'Resolved navigation routing problems'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.8 release'
  },
  '1.3.7': {
    version: '1.3.7',
    buildNumber: 202510310647,
    releaseDate: '2025-10-31',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'User pass management system',
      'BSL 2025 event integration',
      'Speaker profile system with avatars',
      'Event agenda with live updates',
      'Unified search and filter system',
      'Dark mode support',
      'Event banner component',
      'Pass card UI with BSL branding',
      'Agenda tabbed interface',
      'Real-time countdown system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues',
      'Resolved TypeScript undefined property errors',
      'Fixed agenda data grouping logic',
      'Corrected speaker count discrepancies',
      'Fixed dark mode contrast issues',
      'Resolved navigation routing problems'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.7 release'
  },
  '1.3.6': {
    version: '1.3.6',
    buildNumber: 202510310635,
    releaseDate: '2025-10-31',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'User pass management system',
      'BSL 2025 event integration',
      'Speaker profile system with avatars',
      'Event agenda with live updates',
      'Unified search and filter system',
      'Dark mode support',
      'Event banner component',
      'Pass card UI with BSL branding',
      'Agenda tabbed interface',
      'Real-time countdown system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues',
      'Resolved TypeScript undefined property errors',
      'Fixed agenda data grouping logic',
      'Corrected speaker count discrepancies',
      'Fixed dark mode contrast issues',
      'Resolved navigation routing problems'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.6 release'
  },
  '1.3.5': {
    version: '1.3.5',
    buildNumber: 202510310540,
    releaseDate: '2025-10-31',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'User pass management system',
      'BSL 2025 event integration',
      'Speaker profile system with avatars',
      'Event agenda with live updates',
      'Unified search and filter system',
      'Dark mode support',
      'Event banner component',
      'Pass card UI with BSL branding',
      'Agenda tabbed interface',
      'Real-time countdown system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues',
      'Resolved TypeScript undefined property errors',
      'Fixed agenda data grouping logic',
      'Corrected speaker count discrepancies',
      'Fixed dark mode contrast issues',
      'Resolved navigation routing problems'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.5 release'
  },
'1.3.4': {
    version: '1.3.4',
    buildNumber: 202510302121,
    releaseDate: '2025-10-30',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'User pass management system',
      'BSL 2025 event integration',
      'Speaker profile system with avatars',
      'Event agenda with live updates',
      'Unified search and filter system',
      'Dark mode support',
      'Event banner component',
      'Pass card UI with BSL branding',
      'Agenda tabbed interface',
      'Real-time countdown system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues',
      'Resolved TypeScript undefined property errors',
      'Fixed agenda data grouping logic',
      'Corrected speaker count discrepancies',
      'Fixed dark mode contrast issues',
      'Resolved navigation routing problems'
    ],
    breakingChanges: [],
    notes: 'Version 1.3.4 release'
  },
  '1.3.2': {
    version: '1.3.2',
    buildNumber: 202510272149,
    releaseDate: '2025-10-27',
    releaseType: 'beta',
    environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    features: [
      'Automated version management and changelog updates',
      'Improved version display in UI'
    ],
    bugfixes: [
      'Fixed version history dates and formatting',
      'Updated version display to show correct information'
    ],
    breakingChanges: [],
    notes: 'Updated version display and changelog automation with fixed version history'
  },
  '1.2.9': {
    version: '1.2.9',
    buildNumber: 202510261852,
    releaseDate: '2025-10-26',
    releaseType: 'beta',
    environment: 'production',
    features: [],
    bugfixes: [
      'Fixed TypeScript error where "event" was possibly null in agenda.tsx',
      'Updated dependency array to use optional chaining for event.agenda'
    ],
    breakingChanges: [],
    notes: 'Fixed TypeScript errors and improved error handling'
  },
  '1.2.3': {
    version: '1.2.3',
    buildNumber: 202510181800,
    releaseDate: '2025-10-18',
    releaseType: 'beta',
    environment: 'development',
    features: [
      'Complete networking center with horizontal scrolling',
      'My Requests view for managing sent meeting requests',
      'My Schedule view for scheduled meetings',
      'System Analytics with comprehensive statistics',
      'Blocked Users management system',
      'Enhanced networking statistics and insights',
      'Speaker dashboard for incoming request management',
      'Real-time networking activity tracking'
    ],
    bugfixes: [],
    breakingChanges: [],
    notes: 'Major networking system update with comprehensive meeting request management and analytics'
  },
  '1.2.2': {
    version: '1.2.2',
    buildNumber: 202510151600,
    releaseDate: '2025-10-15',
    releaseType: 'beta',
    environment: 'production',
    features: [],
    bugfixes: [
      'Fixed critical 404 errors in Supabase meeting request system',
      'Resolved database type mismatches',
      'Fixed Lambda deployment parameter issues',
      'Updated AWS SDK to v3 for better performance',
      'Resolved CloudFormation stack deployment errors',
      'Fixed 404 errors in Supabase database functions',
      'Resolved UUID/TEXT type mismatch in meeting request system',
      'Fixed can_make_meeting_request function type casting issues',
      'Updated database functions to handle mixed column types properly'
    ],
    breakingChanges: [],
    notes: 'Fixed critical 404 errors in Supabase meeting request system and resolved database type mismatches'
  },
  '1.2.1': {
    version: '1.2.1',
    buildNumber: 202510151510,
    releaseDate: '2025-10-15',
    releaseType: 'beta',
    environment: 'production',
    features: [],
    bugfixes: [
      'Fixed React Navigation headerBackTitleVisible property error',
      'Fixed headerStyle borderBottomWidth property error',
      'Fixed pass number display showing "unknown" in explorer view',
      'Fixed speaker dashboard loading stuck issue',
      'Fixed get_speaker_meeting_requests SQL GROUP BY error',
      'Improved networking icon visibility in quick access menu'
    ],
    breakingChanges: [],
    notes: 'UI display fixes and automatic version management'
  },
  '1.2.0': {
    version: '1.2.0',
    buildNumber: 202501150000,
    releaseDate: '2025-01-15',
    releaseType: 'beta',
    environment: 'production',
    features: [
      'User pass management system with database integration',
      'BSL 2025 event integration with live agenda updates',
      'Speaker profile system with avatar support and search functionality',
      'Event agenda with tabbed interface and real-time countdown',
      'Unified search and filter system across all views',
      'Dark mode support with proper contrast adjustments',
      'Event banner component for consistent branding',
      'Pass card UI with BSL2025 branding and logo seal',
      'Real-time countdown system for event timing',
      'Version tracking and display system'
    ],
    bugfixes: [
      'Fixed SVG logo rendering issues by implementing text-based fallback',
      'Resolved TypeScript undefined property errors with proper null checking',
      'Fixed agenda data grouping logic for proper day distribution',
      'Corrected speaker count discrepancies and duplicate entries',
      'Fixed dark mode contrast issues across all components',
      'Resolved navigation routing problems between views',
      'Fixed alphabetical dividers in speaker list',
      'Corrected filter and search system consistency'
    ],
    breakingChanges: [],
    notes: 'Initial beta release with core event features'
  }
};

// Version Utilities
export const getVersionInfo = (version?: string): VersionInfo => {
  if (version && VERSION_HISTORY[version]) {
    return VERSION_HISTORY[version];
  }
  return CURRENT_VERSION;
};

export const getLatestVersion = (): VersionInfo => {
  return CURRENT_VERSION;
};

export const getVersionHistory = (): VersionInfo[] => {
  return Object.values(VERSION_HISTORY).sort((a, b) => 
    new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime()
  );
};

export const getVersionBadgeColor = (releaseType: VersionInfo['releaseType']): string => {
  switch (releaseType) {
    case 'stable': return '#34A853';
    case 'beta': return '#007AFF';
    case 'rc': return '#FF9500';
    case 'alpha': return '#FF3B30';
    default: return '#8E8E93';
  }
};

export const getVersionBadgeText = (releaseType: VersionInfo['releaseType']): string => {
  return releaseType.toUpperCase();
};

// Environment Configuration
export const ENVIRONMENT_CONFIG = {
  development: {
    showVersion: true,
    enableAnalytics: false,
    logLevel: 'debug'
  },
  staging: {
    showVersion: true,
    enableAnalytics: true,
    logLevel: 'info'
  },
  production: {
    showVersion: false,
    enableAnalytics: true,
    logLevel: 'warn'
  }
} as const;
