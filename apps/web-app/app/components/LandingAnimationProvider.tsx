'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type LandingAnimationMode = 'full' | 'low' | 'static';

type LandingAnimationContextValue = {
  animationMode: LandingAnimationMode;
  setAnimationMode: (mode: LandingAnimationMode) => void;
};

const LandingAnimationContext = createContext<LandingAnimationContextValue | undefined>(undefined);
const STORAGE_KEY = 'hashpass_landing_animation_mode';

function isLandingAnimationMode(value: string | null): value is LandingAnimationMode {
  return value === 'full' || value === 'low' || value === 'static';
}

/**
 * Central animation setting for the landing page. A future preferences panel
 * can use this hook directly. The choice is persisted independently from the
 * implementation so each rendering tier stays simple to switch or remove.
 */
export function LandingAnimationProvider({
  children,
  initialMode = 'low',
}: {
  children: ReactNode;
  initialMode?: LandingAnimationMode;
}) {
  const [animationMode, setAnimationMode] = useState<LandingAnimationMode>(initialMode);
  useEffect(() => {
    const storedMode = window.localStorage.getItem(STORAGE_KEY);
    if (isLandingAnimationMode(storedMode)) setAnimationMode(storedMode);
  }, []);
  const updateAnimationMode = useCallback((mode: LandingAnimationMode) => {
    window.localStorage.setItem(STORAGE_KEY, mode);
    setAnimationMode(mode);
  }, []);
  const value = useMemo(
    () => ({ animationMode, setAnimationMode: updateAnimationMode }),
    [animationMode, updateAnimationMode]
  );

  return <LandingAnimationContext.Provider value={value}>{children}</LandingAnimationContext.Provider>;
}

export function useLandingAnimationMode(): LandingAnimationContextValue {
  const context = useContext(LandingAnimationContext);
  if (!context) {
    throw new Error('useLandingAnimationMode must be used within LandingAnimationProvider');
  }
  return context;
}

/** Use this in shared UI which may also render outside the marketing landing page. */
export function useLandingAnimationModeOptional(): LandingAnimationContextValue | undefined {
  return useContext(LandingAnimationContext);
}
