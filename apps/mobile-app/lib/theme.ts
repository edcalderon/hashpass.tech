import { DefaultTheme, DarkTheme } from '@react-navigation/native';
import { Platform } from 'react-native';

// Define the theme colors interface
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
    textSecondary: string; // Alias for secondary for backward compatibility
  };
  error: {
    main: string;
    light: string;
    dark: string;
  };
  success: {
    main: string;
    light: string;
    dark: string;
  };
  warning: {
    main: string;
    light: string;
    dark: string;
  };
  divider: string;
  surface?: string; // Add surface as an optional property
}

// Base color palette
const baseColors = {
  primary: {
    main: '#af0d01', 
    light: '#a1d1d6',
    dark: '#651FFF',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: '#FF80AB', // Softer pink
    light: '#FFA8C5',
    dark: '#af0d01',
    contrastText: '#000000',
  },
  background: {
    primary: '#FFFFFF',
    default: '#FFFFFF',
    paper: '#F5F5F7', // Slightly darker for better contrast
  },
  text: {
    primary: '#1A1A1A', // Darker for better readability
    secondary: '#4A4A4A',
    textSecondary: '#4A4A4A', // Alias for secondary
    disabled: '#A0A0A0',
  },
  error: {
    main: '#FF5252',
    light: '#FF8A80',
    dark: '#D32F2F',
  },
  success: {
    main: '#4CAF50',
    light: '#81C784',
    dark: '#388E3C',
  },
  warning: {
    main: '#FFAB00', // Brighter yellow for better visibility
    light: '#FFD54F',
    dark: '#FF8F00',
  },
  divider: 'rgba(0, 0, 0, 0.08)', // Lighter divider
};

// Light theme
export const lightColors: ThemeColors = {
  ...DefaultTheme.colors,
  primary: baseColors.primary.main,
  primaryLight: baseColors.primary.light,
  primaryDark: baseColors.primary.dark,
  primaryContrastText: baseColors.primary.contrastText,
  secondary: baseColors.secondary.main,
  secondaryLight: baseColors.secondary.light,
  secondaryDark: baseColors.secondary.dark,
  secondaryContrastText: baseColors.secondary.contrastText,
  background: {
    primary: baseColors.background.default,
    default: baseColors.background.default,
    paper: baseColors.background.paper,
  },
  text: {
    ...baseColors.text,
    onSurface: baseColors.text.primary,
    onSurfaceVariant: baseColors.text.secondary
  },
  error: baseColors.error,
  success: baseColors.success,
  warning: baseColors.warning,
  divider: baseColors.divider,
  surface: baseColors.background.paper, // Add surface color
};

// Dark theme
export const darkColors: ThemeColors = {
  ...DarkTheme.colors,
  primary: baseColors.primary.light,
  primaryLight: baseColors.primary.main,
  primaryDark: baseColors.primary.dark,
  primaryContrastText: baseColors.primary.contrastText,
  secondary: baseColors.secondary.light,
  secondaryLight: baseColors.secondary.main,
  secondaryDark: baseColors.secondary.dark,
  secondaryContrastText: baseColors.secondary.contrastText,
  background: {
    primary: '#121212',
    default: '#121212',
    paper: '#1E1E1E',
  },
  text: {
    primary: '#FFFFFF',
    secondary: '#F0F0F0',
    textSecondary: '#F0F0F0', // Alias for secondary
    disabled: 'rgba(255, 255, 255, 0.7)',
    onSurface: '#FFFFFF',
    onSurfaceVariant: '#F0F0F0'
  },
  error: {
    main: baseColors.error.light,
    light: baseColors.error.main,
    dark: baseColors.error.dark,
  },
  success: {
    main: baseColors.success.light,
    light: baseColors.success.main,
    dark: baseColors.success.dark,
  },
  warning: {
    main: baseColors.warning.light,
    light: baseColors.warning.main,
    dark: baseColors.warning.dark,
  },
  divider: 'rgba(255, 255, 255, 0.2)',
  surface: '#1E1E1E', // Add surface color for dark theme
};

// Helper to create shadow styles with web compatibility
const createShadow = (
  shadowColor: string,
  shadowOffset: { width: number; height: number },
  shadowOpacity: number,
  shadowRadius: number,
  elevation: number
) => {
  if (Platform.OS === 'web') {
    const offsetX = shadowOffset.width || 0;
    const offsetY = shadowOffset.height || 0;
    const blur = shadowRadius || 0;
    const opacity = shadowOpacity || 0;
    
    // Convert hex to rgba
    const hex = shadowColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const rgbaColor = `rgba(${r}, ${g}, ${b}, ${opacity})`;
    
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${blur}px ${rgbaColor}`,
    } as any;
  }
  
  return {
    shadowColor,
    shadowOffset,
    shadowOpacity,
    shadowRadius,
    elevation,
  };
};

export const themeShadows = {
  small: createShadow('#000', { width: 0, height: 2 }, 0.1, 4, 2),
  medium: createShadow('#000', { width: 0, height: 4 }, 0.15, 8, 5),
  large: createShadow('#000', { width: 0, height: 8 }, 0.2, 16, 10),
};

export const themeSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const themeBorderRadius = {
  small: 4,
  medium: 8,
  large: 12,
  xlarge: 16,
  full: 9999,
};