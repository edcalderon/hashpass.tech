import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANIMATIONS_STORAGE_KEY = '@animations_enabled';

interface AnimationContextType {
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => Promise<void>;
  isReady: boolean;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export const AnimationProvider = ({ children }: { children: ReactNode }) => {
  const [animationsEnabled, setAnimationsEnabledState] = useState(true);
  const [isReady, setIsReady] = useState(false);

  // Load saved animations preference
  useEffect(() => {
    const loadAnimationsPreference = async () => {
      try {
        const savedPreference = await AsyncStorage.getItem(ANIMATIONS_STORAGE_KEY);
        if (savedPreference !== null) {
          setAnimationsEnabledState(savedPreference === 'true');
        }
      } catch (error) {
        console.error('Failed to load animations preference', error);
      } finally {
        setIsReady(true);
      }
    };

    loadAnimationsPreference();
  }, []);

  const setAnimationsEnabled = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(ANIMATIONS_STORAGE_KEY, enabled.toString());
      setAnimationsEnabledState(enabled);
    } catch (error) {
      console.error('Failed to save animations preference', error);
    }
  };

  return (
    <AnimationContext.Provider
      value={{
        animationsEnabled,
        setAnimationsEnabled,
        isReady,
      }}
    >
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimations = (): AnimationContextType => {
  const context = useContext(AnimationContext);
  if (context === undefined) {
    throw new Error('useAnimations must be used within an AnimationProvider');
  }
  return context;
};

