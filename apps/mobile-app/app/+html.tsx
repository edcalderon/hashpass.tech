import { ScrollViewStyleReset } from 'expo-router/html';
import { type ReactNode } from 'react';
import {
  resolvePublicSupabaseConfig,
  type SupabaseProfileId,
} from '../config/supabase-profiles';

type RootMetadata = {
  author?: string;
  canonicalUrl?: string;
  description?: string;
  imageUrl?: string;
  keywords?: string;
  robots?: string;
  title?: string;
  viewport?: string;
};

const DEFAULT_TITLE = 'HashPass | Events, Digital Passes and Networking';
const DEFAULT_DESCRIPTION =
  'Discover events, manage verified digital passes, build your agenda, and connect with the people who matter through HashPass.';
const DEFAULT_KEYWORDS =
  'event app, digital event pass, QR check-in, event networking, event agenda, conference app, blockchain events, HashPass';
const SITE_URL = 'https://hashpass.tech';
const SOCIAL_IMAGE_URL = `${SITE_URL}/assets/hashpass-social-card-1200x630.png`;

// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({
  children,
  metadata,
}: {
  children: ReactNode;
  metadata?: RootMetadata;
}) {
  const readBuildEnv = (name: string): string | undefined => {
    if (typeof process === 'undefined') return undefined;

    const value = process.env?.[name];
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  };

  const buildSupabaseConfig = (profileId: SupabaseProfileId) => {
    const { supabaseUrl, supabaseAnonKey } = resolvePublicSupabaseConfig({
      profileId,
      readEnv: readBuildEnv,
    });

    return {
      supabaseUrl: supabaseUrl || '',
      supabaseAnonKey: supabaseAnonKey || '',
    };
  };

  const activeSupabaseProfileId = (readBuildEnv('EXPO_PUBLIC_SUPABASE_PROFILE') ||
    readBuildEnv('SUPABASE_PROFILE') ||
    'core-production') as SupabaseProfileId;
  const activeSupabaseConfig = buildSupabaseConfig(activeSupabaseProfileId);
  const runtimeSupabaseProfiles = {
    'core-development': buildSupabaseConfig('core-development'),
    'core-production': buildSupabaseConfig('core-production'),
    'bsl-development': buildSupabaseConfig('bsl-development'),
    'bsl-production': buildSupabaseConfig('bsl-production'),
  };
  const title = metadata?.title || DEFAULT_TITLE;
  const description = metadata?.description || DEFAULT_DESCRIPTION;
  const keywords = metadata?.keywords || DEFAULT_KEYWORDS;
  const imageUrl = metadata?.imageUrl || SOCIAL_IMAGE_URL;
  const canonicalUrl = metadata?.canonicalUrl;
  const robots =
    metadata?.robots ||
    'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'HASHPASS',
        url: SITE_URL,
        logo: `${SITE_URL}/assets/pwa-icon-512.png`,
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: 'HASHPASS',
        description,
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
        inLanguage: 'en',
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#webapp`,
        name: 'HASHPASS',
        url: SITE_URL,
        description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Android, iOS, Web',
        browserRequirements: 'Requires JavaScript and a modern web browser.',
        image: imageUrl,
        publisher: {
          '@id': `${SITE_URL}/#organization`,
        },
      },
    ],
  }).replace(/</g, '\\u003c');

  return (
    <html lang="en" dir="ltr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <title>{title}</title>
        <meta
          name="viewport"
          content={
            metadata?.viewport ||
            'width=device-width, initial-scale=1, viewport-fit=cover'
          }
        />
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta name="author" content={metadata?.author || 'HASHPASS'} />
        <meta name="publisher" content="HASHPASS" />
        <meta name="application-name" content="HASHPASS" />
        <meta name="robots" content={robots} />
        <meta name="googlebot" content={robots} />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="color-scheme" content="dark light" />
        <meta name="theme-color" content="#05070C" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="HASHPASS" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="msapplication-TileColor" content="#05070C" />
        <meta name="msapplication-TileImage" content="/assets/mstile-150x150.png" />
        {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
        <meta property="og:site_name" content="HASHPASS" />
        <meta property="og:locale" content="en_US" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl || SITE_URL} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:secure_url" content={imageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="HashPass event platform and digital pass" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
        <meta name="twitter:image:alt" content="HashPass event platform and digital pass" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preconnect" href="https://api.hashpass.tech" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="//api.hashpass.tech" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: structuredData }}
        />

        {/* Publish runtime config for inline browser scripts. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.__HASHPASS_RUNTIME__ = window.__HASHPASS_RUNTIME__ || {};

              // Set API base URL for version check (used by inline service worker script)
              // Defaults to api.hashpass.tech/api for production (API Gateway)
              window.__API_BASE_URL__ = (function () {
                var envApiBase = ${JSON.stringify(
                  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_API_BASE_URL || '' : ''
                )};
                if (envApiBase) {
                  return envApiBase;
                }

                if (typeof window !== 'undefined') {
                  var host = (window.location.hostname || '').toLowerCase();
                  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
                    return window.location.origin + '/api';
                  }
                }

                return 'https://api.hashpass.tech/api';
              })();

              // Set the Better Auth base URL so client-side auth code does not have to infer it.
              window.__BETTER_AUTH_URL__ = (function () {
                var envBetterAuthUrl = ${JSON.stringify(
                  typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_BETTER_AUTH_URL || '' : ''
                )};
                if (envBetterAuthUrl) {
                  return envBetterAuthUrl;
                }

                if (typeof window !== 'undefined' && window.__API_BASE_URL__) {
                  return window.__API_BASE_URL__.replace(/\\/$/, '') + '/auth';
                }

                return 'https://api.hashpass.tech/api/auth';
              })();

              window.__HASHPASS_RUNTIME__.apiBaseUrl = window.__API_BASE_URL__;
              window.__HASHPASS_RUNTIME__.betterAuthUrl = window.__BETTER_AUTH_URL__;
              window.__HASHPASS_RUNTIME__.supabaseUrl = ${JSON.stringify(activeSupabaseConfig.supabaseUrl)};
              window.__HASHPASS_RUNTIME__.supabaseAnonKey = ${JSON.stringify(activeSupabaseConfig.supabaseAnonKey)};
              window.__HASHPASS_RUNTIME__.supabaseProfiles = ${JSON.stringify(runtimeSupabaseProfiles)};
            `,
          }}
        />

        {/* OAuth redirect fix - runs immediately to intercept Supabase redirects */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                'use strict';
                // Only run on auth.hashpass.co domain (Supabase custom auth domain)
                if (typeof window === 'undefined' || window.location.host !== 'auth.hashpass.co') {
                  return;
                }
                
                const currentPath = window.location.pathname;
                const hashFragment = window.location.hash;
                
                // Check if we're on the incorrect redirect path with auth tokens
                // Works with any hashpass.tech subdomain (bsl2025, event2026, etc.)
                const isIncorrectRedirect = currentPath.includes('hashpass.tech') || 
                                           currentPath.match(/\\/[a-z0-9-]+\\.hashpass\\.tech/i);
                
                if (isIncorrectRedirect && hashFragment && hashFragment.includes('access_token')) {

                  console.log('🔧 [Auto-fix] Detected incorrect Supabase redirect with tokens');
                  
                  // Try to extract from path first (e.g., /bsl2025.hashpass.tech -> https://bsl2025.hashpass.tech)
                  // Dynamic: works with any hashpass.tech subdomain
                  let correctOrigin = '';
                  
                  // First, try to get from current window location if we're on a hashpass.tech domain
                  if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('hashpass.tech')) {
                    correctOrigin = window.location.protocol + '//' + window.location.hostname;
                  }
                  
                  // Method 1: Try to extract from path
                  if (currentPath.includes('hashpass.tech')) {
                    const domainMatch = currentPath.match(/([a-z0-9-]+\\.hashpass\\.tech)/i);
                    if (domainMatch) {
                      correctOrigin = 'https://' + domainMatch[1];
                      console.log('📍 [Auto-fix] Extracted origin from path:', correctOrigin);
                    }
                  }
                  
                  // Method 2: Try localStorage (stored during OAuth flow)
                  try {
                    const storedOrigin = localStorage.getItem('oauth_redirect_origin');
                    if (storedOrigin) {
                      correctOrigin = storedOrigin;
                      console.log('📍 [Auto-fix] Using stored origin:', correctOrigin);
                    }
                  } catch (e) {
                    console.warn('⚠️ [Auto-fix] Could not access localStorage:', e);
                  }
                  
                  // Method 3: If still no origin, extract from path (works for any subdomain)
                  if (!correctOrigin && currentPath.includes('hashpass.tech')) {
                    const domainMatch = currentPath.match(/([a-z0-9-]+\\.hashpass\\.tech)/i);
                    if (domainMatch) {
                      correctOrigin = 'https://' + domainMatch[1];
                      console.log('📍 [Auto-fix] Extracted from path (Method 3):', correctOrigin);
                    }
                  }
                  
                  // Method 4: For development, check if we're on localhost
                  // If the stored origin is localhost but we're on production, use production
                  if (correctOrigin.includes('localhost') && currentPath.includes('hashpass.tech')) {
                    // Extract production domain from path
                    const domainMatch = currentPath.match(/([a-z0-9-]+\\.hashpass\\.tech)/i);
                    if (domainMatch) {
                      correctOrigin = 'https://' + domainMatch[1];
                      console.log('📍 [Auto-fix] Overriding localhost with production:', correctOrigin);
                    }
                  }
                  
                  // Final fallback: use current origin if available
                  if (!correctOrigin && typeof window !== 'undefined' && window.location) {
                    correctOrigin = window.location.origin;
                    console.log('📍 [Auto-fix] Using current origin as final fallback:', correctOrigin);
                  }
                  
                  // Build redirect URL
                  let redirectUrl = correctOrigin + '/auth/callback';

                  // Preserve hash fragment (contains all OAuth tokens)
                  redirectUrl += hashFragment;
                  
                  // Preserve query params
                  try {
                    const urlParams = new URLSearchParams(window.location.search);
                    urlParams.forEach(function(value, key) {
                      redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 
                                    encodeURIComponent(key) + '=' + encodeURIComponent(value);
                    });
                  } catch (e) {
                    // Ignore
                  }
                  
                  console.log('🚀 [Auto-fix] Redirecting to:', redirectUrl.substring(0, 300));
                  
                  // Redirect immediately
                  window.location.replace(redirectUrl);
                }
              })();
            `,
          }}
        />

        {/* Bootstrap the service worker. */}
        <script dangerouslySetInnerHTML={{ __html: sw }} />

        {/**
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native.
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

      </head>
      <body>{children}</body>
    </html>
  );
}


const sw = `
(function () {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  var isSecureContext =
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

  if (!isSecureContext) {
    return;
  }

  var hostname = String(window.location.hostname || '').toLowerCase();
  var isApiHost =
    hostname === 'api.hashpass.tech' ||
    hostname === 'api-dev.hashpass.tech' ||
    hostname.startsWith('api.') ||
    hostname.startsWith('api-');

  // Disable the PWA service worker on local Expo dev servers and API hosts.
  // Local dev can intercept Metro bundle requests, and API hosts should never
  // register the app shell service worker in the first place.
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    isApiHost
  ) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
      registrations.forEach(function (registration) {
        registration.unregister();
      });
    });
    return;
  }

  navigator.serviceWorker.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'VERSION_UPDATE_AVAILABLE') {
      window.dispatchEvent(
        new CustomEvent('versionUpdateAvailable', {
          detail: {
            currentVersion: event.data.currentVersion,
            latestVersion: event.data.latestVersion,
          },
        })
      );
    }
  });

  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(function (registration) {
        registration.update().catch(function () {});

        registration.addEventListener('updatefound', function () {
          var worker = registration.installing;
          if (!worker) {
            return;
          }

          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(
                new CustomEvent('hashpassServiceWorkerUpdate', {
                  detail: { registration: registration },
                })
              );
            }
          });
        });
      })
      .catch(function (error) {
        console.warn('[PWA] Service worker registration failed:', error);
      });
  });
})();
`;
