import { ReactNode } from 'react';
import { ThemeContext, ThemeContextType } from '../types/theme';

interface ThemeProviderProps {
  value: ThemeContextType;
  children: ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ value, children }) => {
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export { ThemeProvider as default };
