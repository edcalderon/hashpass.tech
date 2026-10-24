import type { ReactNode } from 'react';

export type LanguageContextValue = {
  locale: string;
  setLocale: (locale: string) => Promise<void>;
};

export type LanguageProviderProps = {
  children: ReactNode;
};
