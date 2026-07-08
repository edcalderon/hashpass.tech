import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AnimationLevel = 'full' | 'reduced' | 'none';

interface AnimationLevelContextType {
  animationLevel: AnimationLevel;
  setAnimationLevel: (level: AnimationLevel) => void;
}

const STORAGE_KEY = '@animation_level';

const AnimationLevelContext = createContext<AnimationLevelContextType>({
  animationLevel: 'full',
  setAnimationLevel: () => {},
});

export function AnimationLevelProvider({ children }: { children: React.ReactNode }) {
  const [animationLevel, setLevel] = useState<AnimationLevel>('full');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'full' || v === 'reduced' || v === 'none') setLevel(v);
    });
  }, []);

  const setAnimationLevel = useCallback((level: AnimationLevel) => {
    setLevel(level);
    AsyncStorage.setItem(STORAGE_KEY, level).catch(() => {});
  }, []);

  const value = useMemo(() => ({ animationLevel, setAnimationLevel }), [animationLevel, setAnimationLevel]);

  return (
    <AnimationLevelContext.Provider value={value}>
      {children}
    </AnimationLevelContext.Provider>
  );
}

export function useAnimationLevel() {
  return useContext(AnimationLevelContext);
}
