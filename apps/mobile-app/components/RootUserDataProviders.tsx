import React from 'react';
import { usePathname } from 'expo-router';
import { NotificationProvider } from '@contexts/NotificationContext';
import { BalanceProvider } from '@contexts/BalanceContext';

export const isMcpRoute = (pathname: string): boolean => {
  const normalized = pathname.replace(/^\/\(shared\)/, '');
  return normalized === '/mcp' || normalized.startsWith('/mcp/');
};

export function RootUserDataProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isMcpRoute(pathname)) {
    return <>{children}</>;
  }

  return (
    <NotificationProvider>
      <BalanceProvider>{children}</BalanceProvider>
    </NotificationProvider>
  );
}
