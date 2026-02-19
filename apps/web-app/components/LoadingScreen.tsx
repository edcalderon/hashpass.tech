import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

export interface LoadingScreenProps {
  /**
   * Custom icon name from MaterialIcons (optional)
   * If not provided, will use ActivityIndicator
   */
  icon?: string;
  
  /**
   * Main loading message
   */
  message?: string;
  
  /**
   * Optional subtitle or additional info
   */
  subtitle?: string;
  
  /**
   * Show spinner (default: true if no icon provided)
   */
  showSpinner?: boolean;
  
  /**
   * Size of the spinner (default: 'large')
   */
  spinnerSize?: 'small' | 'large';
  
  /**
   * Custom icon size (default: 48)
   */
  iconSize?: number;
  
  /**
   * Custom icon color (optional, will use theme primary if not provided)
   */
  iconColor?: string;
  
  /**
   * Retry count or attempt number (optional)
   * Will show "Retrying... (X/3)" format if provided
   */
  retryCount?: number;
  
  /**
   * Full screen mode (default: false)
   * If true, takes full screen. If false, takes container space
   */
  fullScreen?: boolean;
}

/**
 * Unified Loading Screen Component
 * Provides consistent loading states across the app with customization options
 */
const LoadingScreen: React.FC<LoadingScreenProps> = ({
  icon,
  message,
  subtitle,
  showSpinner,
  spinnerSize = 'large',
  iconSize = 48,
  iconColor,
  retryCount,
  fullScreen = false,
}) => {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation('common');
  const styles = getStyles(isDark, colors, fullScreen);
  
  // Determine if we should show spinner (default: true if no icon)
  const shouldShowSpinner = showSpinner !== undefined ? showSpinner : !icon;
  
  // Determine icon color
  const finalIconColor = iconColor || colors.primary;
  
  // Build display message with translations
  const defaultMessage = t('loading.default') || 'Loading...';
  const finalMessage = message || defaultMessage;
  
  const displayMessage = retryCount !== undefined && retryCount > 0
    ? (t('loading.retrying', { retryCount }) || `Retrying... (${retryCount}/3)`)
    : finalMessage;
  
  const retryHintText = t('loading.retryHint') || 'Taking longer than expected, please wait...';

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Icon or Spinner */}
        {icon ? (
          <MaterialIcons 
            name={icon as any} 
            size={iconSize} 
            color={finalIconColor} 
            style={styles.icon}
          />
        ) : shouldShowSpinner ? (
          <ActivityIndicator 
            size={spinnerSize} 
            color={finalIconColor} 
            style={styles.spinner}
          />
        ) : null}
        
        {/* Main Message */}
        <Text style={[styles.message, { color: colors.text.primary }]}>
          {displayMessage}
        </Text>
        
        {/* Subtitle */}
        {subtitle && (
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            {subtitle}
          </Text>
        )}
        
        {/* Retry hint */}
        {retryCount !== undefined && retryCount > 0 && (
          <Text style={[styles.retryHint, { color: colors.text.secondary }]}>
            {retryHintText}
          </Text>
        )}
      </View>
    </View>
  );
};

const getStyles = (isDark: boolean, colors: any, fullScreen: boolean) => StyleSheet.create({
  container: {
    flex: fullScreen ? 1 : undefined,
    justifyContent: 'center',
    alignItems: 'center',
    padding: fullScreen ? 0 : 40,
    minHeight: fullScreen ? '100%' : 200,
    backgroundColor: fullScreen ? colors.background.default : 'transparent',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 300,
  },
  icon: {
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 24,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 0,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  retryHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});

export default LoadingScreen;

