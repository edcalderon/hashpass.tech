import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
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
const SOCIAL_IMAGE_PATH = '/og-image.png';

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_SITE_URL),
  applicationName: 'HashPass Club',
  title: {
    default: 'hashpass.club — Membership management',
    template: '%s | hashpass.club',
  },
  description:
    'HashPass gives invite-only clubs, communities, and events a unified platform to manage members, access, and renewals across mobile and web.',
  keywords: ['membership', 'club management', 'NFT tickets', 'blockchain', 'community'],
  alternates: {
    canonical: CANONICAL_SITE_URL,
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'HashPass Club',
  },
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: CANONICAL_SITE_URL,
    siteName: 'hashpass.club',
    title: 'hashpass.club — Membership management',
    description: 'Unified membership platform for invite-only clubs, communities, and events.',
    images: [
      {
        url: SOCIAL_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: 'HashPass Club membership management platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'hashpass.club',
    description: 'Membership infrastructure for modern clubs.',
    images: [SOCIAL_IMAGE_PATH],
  },
  icons: {
    icon: [
      {
        url: '/hashpass-club-favicon/favicon-v2.ico',
        type: 'image/x-icon',
        sizes: 'any',
      },
      {
        url: '/hashpass-club-favicon/favicon-32x32-v2.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/hashpass-club-favicon/favicon-16x16-v2.png',
        type: 'image/png',
        sizes: '16x16',
      },
    ],
    apple: '/hashpass-club-favicon/apple-touch-icon-v2.png',
    shortcut: '/hashpass-club-favicon/favicon-v2.ico',
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
        <Script
          id="canonical-domain-redirect"
          src="/canonical-redirect.js"
          strategy="beforeInteractive"
        />
        <Script
          id="theme-bootstrap"
          src="/theme-init.js"
          strategy="beforeInteractive"
        />
        <Script
          id="service-worker-registration"
          src="/sw-register.js"
          strategy="afterInteractive"
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
