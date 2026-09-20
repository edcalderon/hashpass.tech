import React from 'react';
import { Badge } from '@hashpass/ui/primitives';
import { useTheme } from '../hooks/useTheme';
export default function LandingBadge({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  return <Badge mode={isDark ? 'dark' : 'light'}>{children}</Badge>;
}
