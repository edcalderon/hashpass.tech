import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@fontsource/fraunces/500.css';
import '@fontsource/fraunces/600.css';
import '@fontsource/fraunces/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './globals.css';

import { ThemeProvider } from './components/ThemeProvider';
import { I18nProvider } from '@hashpass/i18n';

const CANONICAL_SITE_URL = 'https://hashpass.club';

function getCanonicalDomainRedirectScript() {
  return `
    (function () {
      try {
        var host = window.location.hostname.toLowerCase();
        var path = window.location.pathname || '/';
        var search = window.location.search || '';
        var hash = window.location.hash || '';
        var target = null;

        if (host === 'club.hashpass.tech') {
          target = '${CANONICAL_SITE_URL}' + path + search + hash;
        } else if (host === 'docs.hashpass.tech') {
          if (path === '/' || path === '/documentation' || path === '/documentation/') {
            target = '${CANONICAL_SITE_URL}/documentation/' + search + hash;
          } else if (!path.startsWith('/documentation/')) {
            target =
              '${CANONICAL_SITE_URL}/documentation' +
              (path.charAt(0) === '/' ? path : '/' + path) +
              search +
              hash;
          }
        }

        if (target && target !== window.location.href) {
          window.location.replace(target);
        }
      } catch (error) {}
    })();
  `;
}

export const metadata: Metadata = {
  metadataBase: new URL('https://hashpass.club'),
  title: {
    default: 'hashpass.club — Membership management',
    template: '%s | hashpass.club',
  },
  description:
    'HashPass gives invite-only clubs, communities, and events a unified platform to manage members, access, and renewals across mobile and web.',
  keywords: ['membership', 'club management', 'NFT tickets', 'blockchain', 'community'],
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://hashpass.club',
    siteName: 'hashpass.club',
    title: 'hashpass.club — Membership management',
    description: 'Unified membership platform for invite-only clubs, communities, and events.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'hashpass.club',
    description: 'Membership infrastructure for modern clubs.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#050816' },
    { media: '(prefers-color-scheme: light)', color: '#fafbff' },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: getCanonicalDomainRedirectScript(),
          }}
        />
        {/* Prevent flash of wrong theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('hashpass_theme');var r=t==='light'?'light':t==='dark'?'dark':(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');document.documentElement.setAttribute('data-theme',r);}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider defaultLocale="en">
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
