import { ScrollViewStyleReset } from 'expo-router/html';
import { type ReactNode } from 'react';


// This file is web-only and used to configure the root HTML for every
// web page during static rendering.
// The contents of this function only run in Node.js environments and
// do not have access to the DOM or browser APIs.
export default function Root({ children, metadata }: { children: ReactNode, metadata?: { description?: string; title?: string; keywords?: string; author?: string; viewport?: string; } }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <title>{metadata?.title || "HashPass"}</title>
        <meta name="viewport" content={metadata?.viewport || "width=device-width, initial-scale=1, shrink-to-fit=no, user-scalable=no, viewport-fit=cover"} />
        <meta name="description" content={metadata?.description || "YOUR EVENT - YOUR COMMUNITY - YOUR BENEFITS"} />
        <meta name="keywords" content={metadata?.keywords || "community, event, benefits, security, encryption, digital security, password protection, blockchain, wallet, loyalty"} />
        <meta name="author" content="HashPass" />
        <meta name="publisher" content="HashPass" />
        <meta name="robots" content="index, follow" />
        <meta name="camera" content="required" />
        <meta property="og:title" content={metadata?.title || "HashPass - YOUR EVENT - YOUR COMMUNITY - YOUR BENEFITS"} />
        <meta property="og:description" content={metadata?.description || "YOUR EVENT - YOUR COMMUNITY - YOUR BENEFITS"} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://hashpass.tech" />
        <meta property="og:image" content="/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metadata?.title || "HashPass - YOUR EVENT - YOUR COMMUNITY - YOUR BENEFITS"} />
        <meta name="twitter:description" content={metadata?.description || "YOUR EVENT - YOUR COMMUNITY - YOUR BENEFITS"} />
        <meta name="twitter:image" content="/twitter-image.png" />
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href="/manifest.json" />

        {/* Inject API base URL for inline scripts */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Set API base URL for version check (used by inline service worker script)
              // Defaults to api.hashpass.tech/api for production (API Gateway)
              // Can be overridden via environment variable EXPO_PUBLIC_API_BASE_URL
              window.__API_BASE_URL__ = ${JSON.stringify(
                typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_BASE_URL
                  ? process.env.EXPO_PUBLIC_API_BASE_URL
                  : 'https://api.hashpass.tech/api'
              )};
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
                                           currentPath.match(/\/[a-z0-9-]+\.hashpass\.tech/i);
                
                if (isIncorrectRedirect && hashFragment && hashFragment.includes('access_token')) {
                  
                  console.log('🔧 [Auto-fix] Detected incorrect Supabase redirect with tokens');
                  
                  // Get stored origin or use default
                  // Try to extract from path first (e.g., /bsl2025.hashpass.tech -> https://bsl2025.hashpass.tech)
                  // Dynamic: works with any hashpass.tech subdomain
                  let correctOrigin = '';
                  
                  // First, try to get from current window location if we're on a hashpass.tech domain
                  if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('hashpass.tech')) {
                    correctOrigin = window.location.protocol + '//' + window.location.hostname;
                  }
                  
                  // Method 1: Try to extract from path
                  if (currentPath.includes('hashpass.tech')) {
                    const domainMatch = currentPath.match(/([a-z0-9-]+\.hashpass\.tech)/i);
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
                    const domainMatch = currentPath.match(/([a-z0-9-]+\.hashpass\.tech)/i);
                    if (domainMatch) {
                      correctOrigin = 'https://' + domainMatch[1];
                      console.log('📍 [Auto-fix] Extracted from path (Method 3):', correctOrigin);
                    }
                  }
                  
                  // Method 4: For development, check if we're on localhost
                  // If the stored origin is localhost but we're on production, use production
                  if (correctOrigin.includes('localhost') && currentPath.includes('hashpass.tech')) {
                    // Extract production domain from path
                    const domainMatch = currentPath.match(/([a-z0-9-]+\.hashpass\.tech)/i);
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
                  
                  // Try to get apikey
                  let apikey = '';
                  try {
                    apikey = window.__SUPABASE_ANON_KEY__ || 
                             window.__EXPO_PUBLIC_SUPABASE_KEY__ ||
                             (localStorage && localStorage.getItem('supabase_anon_key')) || '';
                  } catch (e) {
                    // Ignore
                  }
                  
                  if (apikey) {
                    redirectUrl += '?apikey=' + encodeURIComponent(apikey);
                  }
                  
                  // Preserve hash fragment (contains all OAuth tokens)
                  redirectUrl += hashFragment;
                  
                  // Preserve query params
                  try {
                    const urlParams = new URLSearchParams(window.location.search);
                    urlParams.forEach(function(value, key) {
                      if (key !== 'apikey') {
                        redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + 
                                      encodeURIComponent(key) + '=' + encodeURIComponent(value);
                      }
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
if ('serviceWorker' in navigator) {
    // First, unregister all existing service workers to stop reload loops
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister().then(function(success) {
                if (success) {
                    console.log('✅ Unregistered old service worker');
                }
            });
        }
    }).then(() => {
        // Clear all caches
        if ('caches' in window) {
            caches.keys().then(function(cacheNames) {
                return Promise.all(
                    cacheNames.map(function(cacheName) {
                        console.log('🗑️ Clearing cache:', cacheName);
                        return caches.delete(cacheName);
                    })
                );
            }).then(() => {
                console.log('✅ All caches cleared');
            });
        }
    }).then(() => {
        // Wait before registering new service worker
        setTimeout(() => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    console.log('✅ Service Worker registered with scope:', reg.scope);
                    
                    // Listen for service worker updates (but don't auto-reload)
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('ℹ️ New service worker available. Manual refresh recommended.');
                                }
                            });
                        }
                    });
                    
                    // Listen for messages from service worker
                    navigator.serviceWorker.addEventListener('message', (event) => {
                        if (event.data && event.data.type === 'VERSION_UPDATE_AVAILABLE') {
                            console.log('ℹ️ Version update available:', event.data);
                            // Dispatch custom event for React components to listen to
                            window.dispatchEvent(new CustomEvent('versionUpdateAvailable', {
                                detail: {
                                    currentVersion: event.data.currentVersion,
                                    latestVersion: event.data.latestVersion
                                }
                            }));
                        }
                    });
                    
                    // Check version immediately on page load (no delay)
                    if (reg.active) {
                        reg.active.postMessage({ type: 'CHECK_VERSION' });
                    }
                    
                    // Also check version via API directly (client-side check)
                    // Note: Using fetch directly here because this inline script runs before React/imports are available
                    // The API client is used in lib/version-checker.ts for other version checks
                    // Detect API base URL: use api.hashpass.tech/api for production, or relative /api for same-origin
                    var apiBaseUrl = '/api';
                    try {
                        // Check if EXPO_PUBLIC_API_BASE_URL is set in window or meta tag
                        if (typeof window !== 'undefined') {
                            // Try to get from window (set during build)
                            if (window.__API_BASE_URL__) {
                                apiBaseUrl = window.__API_BASE_URL__;
                            } else {
                                // Check meta tag
                                var metaTag = document.querySelector('meta[name="api-base-url"]');
                                if (metaTag && metaTag.getAttribute('content')) {
                                    apiBaseUrl = metaTag.getAttribute('content');
                                } else {
                                    // Default to api.hashpass.tech/api for production (API Gateway)
                                    // This handles the case where app is on hashpass.tech but API is on api.hashpass.tech
                                    apiBaseUrl = 'https://api.hashpass.tech/api';
                                }
                            }
                        }
                    } catch (e) {
                        // Fallback to api.hashpass.tech/api if detection fails
                        apiBaseUrl = 'https://api.hashpass.tech/api';
                    }
                    
                    // Remove trailing slash and build version check URL
                    apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
                    const versionCheckUrl = apiBaseUrl + '/config/versions?t=' + Date.now() + '&_nocache=' + Math.random();
                    
                    // Determine if this is a cross-origin request
                    const isCrossOrigin = apiBaseUrl.startsWith('http') && !apiBaseUrl.includes(window.location.hostname);
                    
                    fetch(versionCheckUrl, {
                        method: 'GET',
                        cache: 'no-store',
                        credentials: isCrossOrigin ? 'omit' : 'same-origin',
                        headers: {
                            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0',
                        },
                        // Use cors mode for cross-origin requests (hashpass.co), same-origin for relative paths
                        mode: isCrossOrigin ? 'cors' : 'same-origin',
                    })
                    .then(response => {
                        if (!response.ok) {
                            console.warn('[VersionCheck] API returned:', response.status, response.statusText);
                            return null;
                        }
                        return response.json();
                    })
                    .then(data => {
                        if (data?.currentVersion) {
                            console.log('📦 [VersionCheck] Current app version:', data.currentVersion);
                            // Version mismatch will be handled by service worker
                        } else {
                            console.warn('[VersionCheck] No version data in response');
                        }
                    })
                    .catch(err => {
                        console.warn('[VersionCheck] Failed:', err.message || err);
                    });
                })
                .catch(error => {
                    console.error('❌ Service Worker registration failed:', error);
                });
        }, 2000);
    });
}
`;
