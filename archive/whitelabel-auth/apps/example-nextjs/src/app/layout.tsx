import { AuthProvider } from '@whitelabel/auth/react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WhiteLabel Auth Example',
  description: 'Example app for @whitelabel/auth',
};

const authConfig = {
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  },
  directus: {
    url: process.env.NEXT_PUBLIC_DIRECTUS_URL!,
    oauth: {
      providers: ['google', 'github'] as const,
      redirectUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  },
  sync: {
    enabled: true,
    strategy: 'webhook' as const,
    conflictResolution: 'supabase-wins' as const,
  },
  wallet: {
    ethereum: {
      enabled: true,
      chainId: 1,
    },
    solana: {
      enabled: true,
      network: 'mainnet-beta' as const,
    },
  },
  storage: {
    type: 'localStorage' as const,
  },
  app: {
    name: 'WhiteLabel Auth Example',
    url: process.env.NEXT_PUBLIC_SITE_URL!,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider config={authConfig}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
