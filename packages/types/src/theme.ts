import { createContext } from 'react';

// Theme colors interface (shared with lib/theme implementation)
export interface ThemeColors {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryContrastText: string;
  secondary: string;
  secondaryLight: string;
  secondaryDark: string;
  secondaryContrastText: string;
  background: {
    primary: string;
    default: string;
    paper: string;
  };
  text: {
    primary: string;
    secondary: string;
    disabled: string;
    onSurface: string;
    onSurfaceVariant: string;
    textSecondary: string;
  };
  error: { main: string; light: string; dark: string };
  success: { main: string; light: string; dark: string };
  warning: { main: string; light: string; dark: string };
  divider: string;
  surface?: string;
}

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
