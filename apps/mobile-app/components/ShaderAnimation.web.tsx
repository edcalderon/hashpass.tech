import React, { useEffect, useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import AuthBackgroundScene from './auth/AuthBackgroundScene';
import AuthShaderScene from './auth/AuthShaderScene.web';
import { resolveAuthBackgroundVariant, type AuthBackgroundVariant } from '../lib/auth-background-variant';

export default function ShaderAnimation() {
  const { isDark } = useTheme();
  const [variant, setVariant] = useState<AuthBackgroundVariant>('fluid');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setVariant(resolveAuthBackgroundVariant(window.sessionStorage));
  }, []);

  if (!mounted) {
    return <AuthBackgroundScene isDark={isDark} />;
  }

  return variant === 'shader' ? <AuthShaderScene /> : <AuthBackgroundScene isDark={isDark} />;
}
