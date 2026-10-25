import React, { createContext, useContext } from 'react';
import { useLanguageStore } from '../hooks/useLanguageStore';
import { setLocale as setI18nLocale } from '../i18n/i18n';
import type { LanguageContextValue, LanguageProviderProps } from './LanguageProvider.types';

// Expo Router can render a nested route boundary while the root provider tree
// is being rebuilt during web refresh/HMR. Keep that transient boundary safe:
// the fallback still updates the shared Lingui locale instead of crashing the
// dashboard, while the normal provider continues to persist preferences.
const fallbackLanguage: LanguageContextValue = {
  locale: 'en',
  setLocale: setI18nLocale,
};
const LanguageContext = createContext<LanguageContextValue>(fallbackLanguage);

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const { locale, setLocale } = useLanguageStore();
  const displayLocale = locale || 'en'; // Fallback to 'en' if locale is null during initial load

  return (
    <LanguageContext.Provider value={{ locale: displayLocale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextValue => useContext(LanguageContext);
