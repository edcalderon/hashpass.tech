import { Platform, ViewStyle, TextStyle } from 'react-native';

export function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}

/**
 * Converts React Native shadow props to CSS boxShadow for web compatibility
 * Returns a style object with boxShadow for web and shadow props for native
 */
export function createShadowStyle(
  shadowColor: string = '#000',
  shadowOffset: { width: number; height: number } = { width: 0, height: 0 },
  shadowOpacity: number = 0,
  shadowRadius: number = 0,
  elevation?: number
): ViewStyle | TextStyle {
  if (Platform.OS === 'web') {
    // Convert shadow props to CSS boxShadow for web
    const offsetX = shadowOffset.width || 0;
    const offsetY = shadowOffset.height || 0;
    const blur = shadowRadius || 0;
    const opacity = shadowOpacity || 0;
    
    // Convert hex color with opacity
    const rgbaColor = hexToRgba(shadowColor, opacity);
    
    const boxShadow = `${offsetX}px ${offsetY}px ${blur}px ${rgbaColor}`;
    
    return {
      boxShadow,
    } as any;
  } else {
    // Return native shadow props for iOS/Android
    return {
      shadowColor,
      shadowOffset,
      shadowOpacity,
      shadowRadius,
      ...(elevation !== undefined && { elevation }),
    };
  }
}

/**
 * Helper to convert hex color to rgba string
 */
function hexToRgba(hex: string, opacity: number): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Parse hex values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
