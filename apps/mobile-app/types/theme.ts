import { createContext } from 'react';
import { ThemeColors } from '../lib/theme';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => Promise<void>;
  toggleTheme: () => void;
  colors: ThemeColors;
  isDark: boolean;
  isReady: boolean;
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
