import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionTracker } from '../lib/version-tracker';

interface VersionBadgeProps {
  size?: 'small' | 'medium' | 'large';
  showIcon?: boolean;
  onPress?: () => void;
  style?: any;
}

export default function VersionBadge({ 
  size = 'medium', 
  showIcon = false, 
  onPress,
  style 
}: VersionBadgeProps) {
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark, colors, size);

  const badgeInfo = versionTracker.getVersionBadgeInfo();

  const BadgeContent = () => (
    <View style={[styles.badge, { backgroundColor: badgeInfo.color }, style]}>
      {showIcon && (
        <MaterialIcons 
          name="info" 
          size={size === 'small' ? 12 : size === 'large' ? 16 : 14} 
          color="#FFFFFF" 
          style={styles.icon}
        />
      )}
      <Text style={styles.text}>{badgeInfo.text}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <BadgeContent />
      </TouchableOpacity>
    );
  }

  return <BadgeContent />;
}

const getStyles = (isDark: boolean, colors: any, size: string) => {
  const sizeConfig = {
    small: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      fontSize: 8,
      iconSize: 12,
    },
    medium: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      fontSize: 10,
      iconSize: 14,
    },
    large: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
      fontSize: 12,
      iconSize: 16,
    },
  };

  const config = sizeConfig[size];

  return StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: config.paddingHorizontal,
      paddingVertical: config.paddingVertical,
      borderRadius: config.borderRadius,
      shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    icon: {
      marginRight: 4,
    },
    text: {
      fontSize: config.fontSize,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
  });
};
